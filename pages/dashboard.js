// pages/dashboard.js
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import Layout from '../components/Layout';

/* ---------------- Helpers ---------------- */
function monthKey(d) {
  const date = new Date(d);
  if (isNaN(date)) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function lastNMonths(n = 12, startFrom = new Date()) {
  const res = [];
  const now = new Date(startFrom.getFullYear(), startFrom.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    res.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return res;
}
function formatCurrencyBR(v) {
  const n = Number(v || 0);
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  try {
    let d;
    if (String(dateStr).includes('/')) {
      const parts = String(dateStr).split('/');
      if (parts.length >= 3) {
        const day = Number(parts[0]);
        const month = Number(parts[1]) - 1;
        const year = Number(parts[2]);
        d = new Date(year, month, day);
      } else {
        d = new Date(dateStr);
      }
    } else if (!String(dateStr).includes('T') && /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
      d = new Date(dateStr + 'T00:00:00');
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d)) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  } catch {
    return dateStr;
  }
}
function downloadCSV(rows = [], filename = 'export.csv') {
  if (!rows || rows.length === 0) { alert('Nenhum registro para exportar.'); return; }
  const keys = Object.keys(rows[0]);
  const csv = [ keys.join(','), ...rows.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(',')) ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
async function fetchAllRowsPaged(table, pageSize = 2000, select = '*', filters = q => q) {
  let rows = [], from = 0;
  while (true) {
    const to = from + pageSize - 1;
    let q = supabase.from(table).select(select).range(from, to);
    q = filters(q) || q;
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
    if (rows.length > 5_000_000) throw new Error('Export muito grande, abortando.');
  }
  return rows;
}

/* ---------------- Interpretador "quitado" ---------------- */
function isSaleQuitado(sale) {
  const checkValue = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 'quitado' : 'nao_quitado';
    const sv = String(v).trim().toLowerCase();
    if (sv === '') return null;
    if (['quitado','q','s','sim','yes','true','1'].includes(sv)) return 'quitado';
    if (['não quitado','nao_quitado','nao quitado','nao','n','0','false','no','não'].includes(sv)) return 'nao_quitado';
    return null;
  };
  const p = checkValue(sale.pago);
  if (p) return p === 'quitado';
  const c = checkValue(sale.controle_vendas);
  if (c) return c === 'quitado';
  return false;
}

/* ---------------- normalize payment method ---------------- */
function normalizePaymentMethod(name) {
  if (!name) return 'Não Informado';
  const s = String(name).trim().toLowerCase();
  if (s.includes('pix')) return 'PIX';
  if (s.includes('dinheiro') || s === 'cash') return 'Dinheiro';
  if (s.includes('boleto')) return 'Boleto';
  if (s.includes('credito') || s.includes('crédito') || s.includes('cartao credito') || s.includes('cartão crédito')) return 'Cartão de Crédito';
  if (s.includes('debito') || s.includes('débito') || s.includes('cartao debito') || s.includes('cartão débito')) return 'Cartão de Débito';
  return String(name).split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* ---------------- Component ---------------- */
export default function Dashboard() {
  const mountedRef = useRef(true);
  const chartContainerRef = useRef(null);
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);

  // dados e estados
  const [profiles, setProfiles] = useState([]);
  const [creatorList, setCreatorList] = useState([]);
  const [creatorNameMap, setCreatorNameMap] = useState({});
  const [customers, setCustomers] = useState([]);
  const [customersOverview, setCustomersOverview] = useState([]);
  const [birthdaysThisMonth, setBirthdaysThisMonth] = useState([]);
  const [userBirthdays, setUserBirthdays] = useState([]);
  const [pendenciasByCustomer, setPendenciasByCustomer] = useState([]);
  const [pendenciasGroupSum, setPendenciasGroupSum] = useState(0);
  const [creditList, setCreditList] = useState([]);
  const [neutralList, setNeutralList] = useState([]);
  const [chartData, setChartData] = useState({ months: [], sales: [], payments: [], unpaidCounts: [], unpaidAmounts: [], paidAmounts: [], cumulativePending: [] });
  const [paymentMethodBreakdown, setPaymentMethodBreakdown] = useState([]);
  const [stats, setStats] = useState({ totalSales: 0, totalPayments: 0, unpaidCount: 0, vendasQuitadas: 0, unpaidAmount: 0 });

  // rankings state
  const [topRankings, setTopRankings] = useState({ topBuyers: [], topDebtors: [] });

  // filtros temporários / efetivos
  const [tempSelectedUserIds, setTempSelectedUserIds] = useState([]);
  const [tempSelectedCustomerId, setTempSelectedCustomerId] = useState(null);
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [tempSaleStatusFilter, setTempSaleStatusFilter] = useState('all');

  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saleStatusFilter, setSaleStatusFilter] = useState('all');

  // expansões e cache
  const [expandedCustomers, setExpandedCustomers] = useState({});
  const [expandedSales, setExpandedSales] = useState({});
  const [saleItemsCache, setSaleItemsCache] = useState({});

  // tooltips info boxes
  const [infoVisible, setInfoVisible] = useState({ totalSales: false, totalPayments: false, totalToReceive: false, vendasQuitadas: false, vendasNaoQuitadas: false });

  const preventEnterSubmit = useCallback((e) => { if (e.key === 'Enter') e.preventDefault(); }, []);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (authLoading) return; if (!user) return;
    (async () => {
      try {
        if (isAdmin) { await loadProfiles(); await populateCreatorsList(); setSelectedUserIds(prev => (prev && prev.length > 0) ? prev : [user.id]); setTempSelectedUserIds(prev => (prev && prev.length > 0) ? prev : [user.id]); }
        else { setSelectedUserIds([user.id]); setTempSelectedUserIds([user.id]); }
      } catch (e) {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isAdmin]);

  useEffect(() => {
    if (authLoading) return; if (!user) return;
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isAdmin, selectedUserIds.join(','), selectedCustomerId, startDate, endDate, saleStatusFilter]);

  /* ---------------- Loaders ---------------- */
  async function loadProfiles() {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, raw_user_meta_data').limit(5000);
      if (error) throw error;
      const mapped = (data || []).map(p => ({ id: p.id, full_name: p.full_name || p.email || p.id, email: p.email, birthday: p.raw_user_meta_data?.birthday ?? null }));
      setProfiles(mapped);
      const map = {}; mapped.forEach(p => { map[p.id] = p.full_name || p.email || p.id; }); setCreatorNameMap(map);

      // popula aniversariantes de usuários (filtra por mês atual)
      try {
        if (isAdmin) {
          const today = new Date(); const thisMonth = today.getMonth() + 1;
          const usersWithBirthday = mapped.filter(u => {
            if (!u.birthday) return false;
            const b = String(u.birthday);
            let month;
            if (b.includes('/')) {
              const parts = b.split('/');
              if (parts.length < 3) return false;
              month = Number(parts[1]);
            } else if (/^\d{4}-\d{2}-\d{2}/.test(b)) {
              const [y,m] = b.split('T')[0].split('-'); month = Number(m);
            } else {
              const dt = new Date(b); if (isNaN(dt)) return false; month = dt.getMonth() + 1;
            }
            return month === thisMonth;
          }).map(p => ({ id: p.id, full_name: p.full_name, birthday: p.birthday }));
          setUserBirthdays(usersWithBirthday);
        }
      } catch (e) { setUserBirthdays([]); }
    } catch (err) {} finally { setLoading(false); }
  }

  async function populateCreatorsList() {
    try {
      setLoading(true);
      const { data: srows } = await supabase.from('sales').select('created_by').not('created_by', 'is', null).limit(2000);
      const { data: crows } = await supabase.from('customers').select('created_by').not('created_by', 'is', null).limit(2000);
      const uniq = Array.from(new Set([...(srows || []).map(r => r.created_by), ...(crows || []).map(r => r.created_by)])).filter(Boolean);
      if (user?.id && !uniq.includes(user.id)) uniq.unshift(user.id);

      let nameMap = {};
      try {
        const { data: vusers } = await supabase.from('v_app_users').select('id, full_name').in('id', uniq).limit(2000);
        if (vusers) vusers.forEach(u => { nameMap[u.id] = u.full_name || u.id; });
      } catch (e) {}

      const missing = uniq.filter(id => !nameMap[id]);
      if (missing.length > 0) {
        try {
          const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', missing).limit(2000);
          if (profs) profs.forEach(p => { nameMap[p.id] = p.full_name || p.id; });
        } catch (e) {}
      }
      if (user?.id && !nameMap[user.id]) nameMap[user.id] = 'Eu';
      const list = uniq.map(id => ({ id, name: nameMap[id] || id }));
      setCreatorList(list); setCreatorNameMap(prev => ({ ...prev, ...nameMap }));
    } catch (err) { setCreatorList([]); } finally { setLoading(false); }
  }

  async function loadDashboardData() {
    if (!user) return;
    setLoading(true);
    try {
      // selected users (used for filtering where applicable)
      const selectedUsers = Array.isArray(selectedUserIds) ? selectedUserIds.filter(Boolean) : (selectedUserIds ? [selectedUserIds] : []);

      // customer filter for customers list & customer-specific display (BUT rankings will ignore selectedCustomerId)
      let custFilter = q => q;
      if (!isAdmin) custFilter = q => q.eq('created_by', user.id);
      else if (selectedUsers && selectedUsers.length > 0) custFilter = q => q.in('created_by', selectedUsers);

      // fetch customers (respeita customer filter)
      const customersRows = await fetchAllRowsPaged('customers', 2000, '*', q => {
        q = q.select('customer_id, customer_name, email, phone, birthday, created_by, notes, controle_customer');
        q = custFilter(q);
        return q.order('customer_name', { ascending: true });
      });
      setCustomers(customersRows);

      const today = new Date(); const thisMonth = today.getMonth() + 1;
      const birthdays = (customersRows || []).filter(c => {
        if (!c.birthday) return false;
        const bString = String(c.birthday);
        let month;
        if (bString.includes('/')) {
          const parts = bString.split('/');
          if (parts.length < 3) return false;
          month = Number(parts[1]);
        } else if (/^\d{4}-\d{2}-\d{2}/.test(bString)) {
          const [y,m] = bString.split('T')[0].split('-');
          month = Number(m);
        } else {
          const dt = new Date(bString);
          if (isNaN(dt)) return false;
          month = dt.getMonth() + 1;
        }
        return month === thisMonth;
      }).map(c => ({ ...c }));
      setBirthdaysThisMonth(birthdays);

      if (isAdmin) {
        // userBirthdays já populado no loadProfiles, mas caso precise recalcular aqui:
        // (mantemos o que já está)
      } else setUserBirthdays([]);

      // customers to use (for customer-specific sections) respect selectedCustomerId
      const customersToUse = selectedCustomerId ? (customersRows || []).filter(c => String(c.customer_id) === String(selectedCustomerId)) : customersRows;
      const custIds = selectedCustomerId ? [selectedCustomerId] : (customersToUse || []).map(c => c.customer_id).filter(Boolean);
      const safeCustIds = (custIds || []).map(id => { const n = Number(id); return Number.isFinite(n) ? n : null; }).filter(v => v !== null && v !== undefined);

      // --- fetch sales & payments for customer display (respecting selectedCustomerId) ---
      let salesRowsAll = [], paymentsRowsAll = [];
      if (safeCustIds.length > 0) {
        const salesFilterAll = q => {
          q = q.select('sale_id, customer_id, date, total_amount, discount_real, discount_percent, final_total, notes, created_by, pago, controle_vendas');
          q = q.in('customer_id', safeCustIds);
          if (startDate) q = q.gte('date', startDate);
          if (endDate) q = q.lte('date', endDate);
          return q.order('date', { ascending: true });
        };
        const paymentsFilterAll = q => {
          q = q.select('payment_id, customer_id, amount, date, method, created_by');
          q = q.in('customer_id', safeCustIds);
          if (startDate) q = q.gte('date', startDate);
          if (endDate) q = q.lte('date', endDate);
          return q.order('date', { ascending: true });
        };

        salesRowsAll = await fetchAllRowsPaged('sales', 2000, '*', salesFilterAll);
        paymentsRowsAll = await fetchAllRowsPaged('payments', 2000, '*', paymentsFilterAll);
      } else { salesRowsAll = []; paymentsRowsAll = []; }

      // aggregate per customer for displayed sections (pendências, créditos, etc.)
      const salesByCustomerAll = {};
      (salesRowsAll || []).forEach(s => {
        const id = Number(s.customer_id ?? s.customer);
        if (!Number.isFinite(id)) return;
        if (!salesByCustomerAll[id]) salesByCustomerAll[id] = { sumSales: 0, unpaidCount: 0, rows: [] };
        const amount = Number(s.final_total ?? s.total_amount ?? 0) || 0;
        salesByCustomerAll[id].sumSales += amount;
        if (!isSaleQuitado(s)) salesByCustomerAll[id].unpaidCount = (salesByCustomerAll[id].unpaidCount || 0) + 1;
        salesByCustomerAll[id].rows.push(s);
      });

      const paymentsByCustomerAll = {};
      (paymentsRowsAll || []).forEach(p => {
        const id = Number(p.customer_id ?? p.customer);
        if (!Number.isFinite(id)) return;
        if (!paymentsByCustomerAll[id]) paymentsByCustomerAll[id] = { sumPayments: 0, rows: [] };
        const amount = Number(p.amount ?? 0) || 0;
        paymentsByCustomerAll[id].sumPayments += amount;
        paymentsByCustomerAll[id].rows.push(p);
      });

      const overview = (customersToUse || []).map(c => {
        const id = Number(c.customer_id);
        const sObj = salesByCustomerAll[id] || { sumSales: 0, unpaidCount: 0, rows: [] };
        const pObj = paymentsByCustomerAll[id] || { sumPayments: 0, rows: [] };
        const pending = Number(sObj.sumSales || 0) - Number(pObj.sumPayments || 0);
        return {
          customer: c,
          salesSum: Number(sObj.sumSales || 0),
          paymentsSum: Number(pObj.sumPayments || 0),
          unpaidCount: Number(sObj.unpaidCount || 0),
          pendingAmount: Number(pending || 0),
          salesRows: sObj.rows,
          paymentsRows: pObj.rows
        };
      });
      setCustomersOverview(overview);

      let salesRowsForDisplay = salesRowsAll;
      if (saleStatusFilter === 'quitado') salesRowsForDisplay = (salesRowsAll || []).filter(s => isSaleQuitado(s));
      else if (saleStatusFilter === 'nao_quitado') salesRowsForDisplay = (salesRowsAll || []).filter(s => !isSaleQuitado(s));

      const displayRowsByCustomer = {};
      (salesRowsForDisplay || []).forEach(s => {
        const id = Number(s.customer_id ?? s.customer);
        if (!Number.isFinite(id)) return;
        displayRowsByCustomer[id] = displayRowsByCustomer[id] || [];
        displayRowsByCustomer[id].push(s);
      });

      const overviewWithDisplay = overview.map(o => ({ ...o, salesRows: displayRowsByCustomer[Number(o.customer.customer_id)] || [] }));
      setCustomersOverview(overviewWithDisplay);

      const pendencias = overviewWithDisplay.filter(x => x.pendingAmount > 0);
      const credits = overviewWithDisplay.filter(x => x.pendingAmount < 0);
      const neutral = overviewWithDisplay.filter(x => x.pendingAmount === 0);

      setPendenciasByCustomer(pendencias);
      setCreditList(credits);
      const isFilterActive = Boolean(selectedCustomerId) || Boolean(startDate) || Boolean(endDate) || saleStatusFilter !== 'all' || (selectedUserIds && selectedUserIds.length > 0 && (isAdmin));
      setNeutralList(isFilterActive ? neutral : []);
      const pendSumVal = pendencias.reduce((acc, p) => acc + (p.pendingAmount || 0), 0);
      setPendenciasGroupSum(pendSumVal);

      // --- chart: compute months, sales, payments, unpaid counts, unpaid amounts, paid amounts ---
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-12

      // 1. Gera os 12 meses do ano corrente (até o mês atual)
      const monthsThisYear = [];
      for (let i = 1; i <= currentMonth; i++) {
        monthsThisYear.push(`${currentYear}-${String(i).padStart(2, '0')}`);
      }

      // 2. Busca vendas não quitadas de meses anteriores (para incluir no gráfico)
      const salesUnpaidFilter = q => {
        q = q.select('sale_id, date, final_total, total_amount, created_by, pago, controle_vendas');
        if (!isAdmin) q = q.eq('created_by', user.id);
        else if (selectedUsers && selectedUsers.length > 0) q = q.in('created_by', selectedUsers);
        if (startDate) q = q.gte('date', startDate);
        if (endDate) q = q.lte('date', endDate);
        return q.order('date', { ascending: true });
      };
      const salesUnpaidRows = await fetchAllRowsPaged('sales', 2000, '*', salesUnpaidFilter);

      // Considerar apenas vendas NÃO-quitadas de ANOS ANTERIORES ao ano corrente
      const unpaidBeforeThisYear = (salesUnpaidRows || []).filter(s => {
        if (isSaleQuitado(s)) return false;
        const mk = monthKey(s.date);
        if (!mk) return false;
        const [y, m] = mk.split('-').map(Number);
        return y < currentYear; // <-- aqui: somente anos anteriores, evita duplicação com monthsThisYear
      });

      // coleciona meses anteriores (sem duplicatas) e ordena cronologicamente
      const monthsBeforeSet = new Set();
      (unpaidBeforeThisYear || []).forEach(s => {
        const mk = monthKey(s.date);
        if (mk) monthsBeforeSet.add(mk);
      });
      const monthsBefore = Array.from(monthsBeforeSet).sort((a, b) => (a > b ? 1 : -1));

      // 4. Meses finais: meses anteriores (se houver) + meses do ano corrente
      const months = [...monthsBefore, ...monthsThisYear];

      const salesByMonth = Object.fromEntries(months.map(m => [m, 0]));
      const paymentsByMonth = Object.fromEntries(months.map(m => [m, 0]));
      const unpaidCounts = Object.fromEntries(months.map(m => [m, 0]));
      const unpaidAmounts = Object.fromEntries(months.map(m => [m, 0])); // "Vendas Não Quitadas" (por mês)
      const paidAmounts = Object.fromEntries(months.map(m => [m, 0]));

      (salesRowsAll || []).forEach(s => {
        const d = s.date; if (!d) return;
        const k = monthKey(d); const amt = Number(s.final_total ?? s.total_amount ?? 0) || 0;
        if (k && salesByMonth[k] !== undefined) salesByMonth[k] += amt;
        if (k) {
          if (!isSaleQuitado(s)) {
            if (unpaidCounts[k] !== undefined) unpaidCounts[k] += 1;
            if (unpaidAmounts[k] !== undefined) unpaidAmounts[k] += amt;
          } else {
            if (paidAmounts[k] !== undefined) paidAmounts[k] += amt;
          }
        }
      });

      (paymentsRowsAll || []).forEach(p => {
        const d = p.date; if (!d) return;
        const k = monthKey(d); const amt = Number(p.amount ?? 0) || 0;
        if (k && paymentsByMonth[k] !== undefined) paymentsByMonth[k] += amt;
      });

      // cumulative pending (mantemos cálculo, mas NÃO será exibido no gráfico)
      const cumulativePendingArr = [];
      let running = 0;
      months.forEach(m => { running += (unpaidAmounts[m] || 0); cumulativePendingArr.push(running); });

      // stats
      const totalSalesVal = Object.values(salesByMonth).reduce((a, b) => a + b, 0);
      const totalPaymentsVal = Object.values(paymentsByMonth).reduce((a, b) => a + b, 0);
      const unpaidCountVal = Object.values(unpaidCounts).reduce((a, b) => a + b, 0);
      const vendasQuitadasVal = Object.values(paidAmounts).reduce((a, b) => a + b, 0);
      const unpaidAmountsTotal = Object.values(unpaidAmounts).reduce((a, b) => a + b, 0);
      setStats({ totalSales: totalSalesVal, totalPayments: totalPaymentsVal, unpaidCount: unpaidCountVal, vendasQuitadas: vendasQuitadasVal, unpaidAmount: unpaidAmountsTotal });

      setChartData({
        months,
        sales: months.map(m => salesByMonth[m] || 0),
        payments: months.map(m => paymentsByMonth[m] || 0),
        unpaidCounts: months.map(m => unpaidCounts[m] || 0),
        unpaidAmounts: months.map(m => unpaidAmounts[m] || 0),
        paidAmounts: months.map(m => paidAmounts[m] || 0),
        cumulativePending: cumulativePendingArr
      });

      // payment method breakdown (normalized)
      const methodTotals = {};
      (paymentsRowsAll || []).forEach(p => {
        const nm = normalizePaymentMethod(p.method);
        methodTotals[nm] = (methodTotals[nm] || 0) + Number(p.amount ?? 0);
      });
      const totalPayments = Object.values(methodTotals).reduce((a, b) => a + b, 0);
      const breakdown = Object.entries(methodTotals).map(([method, total]) => ({ method, total, pct: totalPayments ? (100 * total / totalPayments) : 0 })).sort((a, b) => b.total - a.total);
      setPaymentMethodBreakdown(breakdown);

      // ---------------- Rankings ----------------
      const rankingFilter = q => {
        q = q.select('sale_id, customer_id, date, final_total, total_amount, created_by, pago, controle_vendas');
        if (!isAdmin) q = q.eq('created_by', user.id);
        else if (selectedUsers && selectedUsers.length > 0) q = q.in('created_by', selectedUsers);
        if (startDate) q = q.gte('date', startDate);
        if (endDate) q = q.lte('date', endDate);
        return q.order('date', { ascending: true });
      };
      const paymentsRankingFilter = q => {
        q = q.select('payment_id, customer_id, amount, date, created_by');
        if (!isAdmin) q = q.eq('created_by', user.id);
        else if (selectedUsers && selectedUsers.length > 0) q = q.in('created_by', selectedUsers);
        if (startDate) q = q.gte('date', startDate);
        if (endDate) q = q.lte('date', endDate);
        return q.order('date', { ascending: true });
      };

      const salesForRanking = await fetchAllRowsPaged('sales', 2000, '*', rankingFilter);
      const paymentsForRanking = await fetchAllRowsPaged('payments', 2000, '*', paymentsRankingFilter);

      const salesAgg = {};
      (salesForRanking || []).forEach(s => {
        const cid = Number(s.customer_id ?? s.customer);
        if (!Number.isFinite(cid)) return;
        const amt = Number(s.final_total ?? s.total_amount ?? 0) || 0;
        if (!salesAgg[cid]) salesAgg[cid] = { salesSum: 0, unpaidSum: 0 };
        salesAgg[cid].salesSum += amt;
        if (!isSaleQuitado(s)) salesAgg[cid].unpaidSum += amt;
      });
      const paymentsAgg = {};
      (paymentsForRanking || []).forEach(p => {
        const cid = Number(p.customer_id ?? p.customer);
        if (!Number.isFinite(cid)) return;
        const amt = Number(p.amount ?? 0) || 0;
        if (!paymentsAgg[cid]) paymentsAgg[cid] = 0;
        paymentsAgg[cid] += amt;
      });

      const buyersArr = Object.entries(salesAgg).map(([cid, obj]) => ({ customer_id: Number(cid), salesSum: obj.salesSum }));
      buyersArr.sort((a, b) => b.salesSum - a.salesSum);
      const topBuyers = buyersArr.slice(0, 10).map(r => {
        const cust = (customersRows || []).find(c => Number(c.customer_id) === Number(r.customer_id)) || { customer_name: `#${r.customer_id}`, controle_customer: r.customer_id };
        return { customer_id: r.customer_id, name: cust.customer_name, controle: cust.controle_customer ?? r.customer_id, value: r.salesSum };
      });

      const debtArr = Object.entries(salesAgg).map(([cid, obj]) => {
        const paid = paymentsAgg[cid] || 0;
        const pending = Math.max(0, obj.salesSum - paid);
        return { customer_id: Number(cid), pending, salesSum: obj.salesSum, unpaidSum: obj.unpaidSum || 0 };
      });
      debtArr.sort((a, b) => b.pending - a.pending);
      const topDebtors = debtArr.filter(r => r.pending > 0).slice(0, 10).map(r => {
        const cust = (customersRows || []).find(c => Number(c.customer_id) === Number(r.customer_id)) || { customer_name: `#${r.customer_id}`, controle_customer: r.customer_id };
        return { customer_id: r.customer_id, name: cust.customer_name, controle: cust.controle_customer ?? r.customer_id, value: r.pending };
      });

      setTopRankings({ topBuyers, topDebtors });

    } catch (err) {
      alert('Erro ao carregar dashboard: ' + (err.message || err));
    } finally { setLoading(false); }
  }

  /* ---------------- Export helpers ---------------- */
  async function handleExportCustomers() {
    try { setLoading(true);
      const filters = q => { let qq = q.select('*'); if (!isAdmin) qq = qq.eq('created_by', user.id); else if (selectedUserIds && selectedUserIds.length > 0) qq = qq.in('created_by', selectedUserIds); return qq; };
      const rows = await fetchAllRowsPaged('customers', 2000, '*', filters); downloadCSV(rows, `clientes_filtrados_${Date.now()}.csv`);
    } catch (err) { alert('Erro ao exportar customers: ' + (err.message || err)); } finally { setLoading(false); }
  }
  async function handleExportSales() {
    try { setLoading(true);
      const filters = q => { let qq = q.select('*'); if (!isAdmin) qq = qq.eq('created_by', user.id); else if (selectedUserIds && selectedUserIds.length > 0) qq = qq.in('created_by', selectedUserIds); if (selectedCustomerId) qq = qq.eq('customer_id', selectedCustomerId); if (startDate) qq = qq.gte('date', startDate); if (endDate) qq = qq.lte('date', endDate); return qq.order('date', { ascending: true }); };
      const rows = await fetchAllRowsPaged('sales', 2000, '*', filters);
      let finalRows = rows;
      if (saleStatusFilter === 'quitado') finalRows = rows.filter(r => isSaleQuitado(r));
      else if (saleStatusFilter === 'nao_quitado') finalRows = rows.filter(r => !isSaleQuitado(r));
      downloadCSV(finalRows, `vendas_filtradas_${Date.now()}.csv`);
    } catch (err) { alert('Erro ao exportar sales: ' + (err.message || err)); } finally { setLoading(false); }
  }
  async function handleExportSaleItems() {
    try { setLoading(true);
      let salesQ = supabase.from('sales').select('sale_id, controle_vendas, pago').limit(200000);
      if (!isAdmin) salesQ = salesQ.eq('created_by', user.id); else if (selectedUserIds && selectedUserIds.length > 0) salesQ = salesQ.in('created_by', selectedUserIds);
      if (selectedCustomerId) salesQ = salesQ.eq('customer_id', selectedCustomerId);
      if (startDate) salesQ = salesQ.gte('date', startDate);
      if (endDate) salesQ = salesQ.lte('date', endDate);
      const { data: salesData, error: salesErr } = await salesQ;
      if (salesErr) throw salesErr;
      let saleRows = (salesData || []).map(s => s).filter(Boolean);
      if (saleStatusFilter === 'quitado') saleRows = saleRows.filter(s => isSaleQuitado(s));
      else if (saleStatusFilter === 'nao_quitado') saleRows = saleRows.filter(s => !isSaleQuitado(s));
      const saleIds = saleRows.map(s => s.sale_id).filter(Boolean);
      if (saleIds.length === 0) { alert('Nenhuma venda encontrada para exportar itens.'); return; }
      const rows = await fetchAllRowsPaged('sale_items', 2000, '*', q => { let qq = q; if (saleIds && saleIds.length > 0) qq = qq.in('sale_id', saleIds); return qq; });
      downloadCSV(rows, `vendas_itens_filtradas_${Date.now()}.csv`);
    } catch (err) { alert('Erro ao exportar sale_items: ' + (err.message || err)); } finally { setLoading(false); }
  }
  async function handleExportPayments() {
    try { setLoading(true);
      const filters = q => { let qq = q.select('*'); if (!isAdmin) qq = qq.eq('created_by', user.id); else if (selectedUserIds && selectedUserIds.length > 0) qq = qq.in('created_by', selectedUserIds); if (selectedCustomerId) qq = qq.eq('customer_id', selectedCustomerId); if (startDate) qq = qq.gte('date', startDate); if (endDate) qq = qq.lte('date', endDate); return qq.order('date', { ascending: true }); };
      const rows = await fetchAllRowsPaged('payments', 2000, '*', filters); downloadCSV(rows, `pagamentos_filtrados_${Date.now()}.csv`);
    } catch (err) { alert('Erro ao exportar payments: ' + (err.message || err)); } finally { setLoading(false); }
  }
  async function handleExportProfiles() { try { setLoading(true); if (!isAdmin) { alert('Apenas admins podem exportar usuários'); return; } const rows = await fetchAllRowsPaged('profiles', 2000, '*'); downloadCSV(rows, `usuarios_${Date.now()}.csv`); } catch (err) { alert('Erro ao exportar profiles: ' + (err.message || err)); } finally { setLoading(false); } }

  /* ---------------- expand handlers & fetch sale items ---------------- */
  function toggleExpandCustomer(customerId) { setExpandedCustomers(prev => ({ ...prev, [customerId]: !prev[customerId] })); }
  function toggleExpandSale(saleId) { setExpandedSales(prev => ({ ...prev, [saleId]: !prev[saleId] })); if (!saleItemsCache[saleId]) fetchSaleItems(saleId); }
  async function fetchSaleItems(saleId) {
    try {
      const { data, error } = await supabase.from('sale_items').select('*').eq('sale_id', saleId);
      if (error) throw error;
      const items = (data || []).map(it => {
        const qty = Number(it.quantity ?? it.qtd ?? 0) || 0;
        const unit = Number(it.unit_price ?? it.price ?? it.valor ?? 0) || 0;
        const discountReal = Number(it.discount_real_i ?? it.discount_real ?? 0) || 0;
        const discountPercent = Number(it.discount_percent_i ?? it.discount_percent ?? 0) || 0;
        const gross = qty * unit;
        const discountFromPercent = (discountPercent > 0 && discountReal === 0) ? (gross * discountPercent / 100) : 0;
        const finalDiscount = discountReal || discountFromPercent || 0;
        const finalValue = gross - finalDiscount;
        return { ...it, qty, unitPrice: unit, gross, discountReal, discountPercent, finalValue };
      });
      setSaleItemsCache(prev => ({ ...prev, [saleId]: items }));
    } catch (err) { setSaleItemsCache(prev => ({ ...prev, [saleId]: [] })); }
  }

  /* ---------------- Chart component (ajustada divisoria e largura das barras) ---------------- */
  const Chart = ({ months, sales, payments, unpaidCounts, unpaidAmounts, paidAmounts }) => {
    if (!months || months.length === 0) return <div>Nenhum dado para gráfico.</div>;
    const perMonthW = 72;
    const w = Math.max(760, months.length * perMonthW + 140);
    const h = 380;
    const padL = 70, padR = 70, padT = 20, padB = 80;
    const innerH = h - padT - padB;
    const maxVal = Math.max(...sales, ...payments, ...unpaidAmounts, ...paidAmounts, 1);
    const bw = (w - padL - padR) / months.length; const ticks = 4;
    const tickVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxVal * i) / ticks));
    function formatMonthLabel(key) { const monthsNames = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']; const [y, m] = key.split('-'); const idx = Number(m) - 1; const shortYear = String(y).slice(-2); return `${monthsNames[idx]}/${shortYear}`; }

    // offsets e largura das barras por grupo (ajustados para não extrapolar)
    const barOffsets = [0.06, 0.30, 0.54, 0.78];
    const barW = bw * 0.16; // 16% do bw => último fim em ~0.94*bw, dando folga para divisória

    const legendItems = [
      { color: '#3b82f6', label: 'Vendas (azul) - Vendas Efetuadas' },
      { color: '#10b981', label: 'Recebido (verde) - Valores que entraram pelos Pagamentos' },
      { color: '#ef4444', label: 'Vendas Não Quitadas (vermelho) - Valor das vendas "Não Quitadas"' },
      { color: '#fb923c', label: 'Vendas Quitadas (laranja) - Valores das vendas "Quitadas"' }
    ];

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div />
          <div>
            <button onClick={() => {
              const el = chartContainerRef.current;
              if (!el) return;
              if (document.fullscreenElement) document.exitFullscreen();
              else el.requestFullscreen?.();
            }}>Tela Cheia</button>
          </div>
        </div>

        <div ref={chartContainerRef} className="chart-area chart-fullwidth" style={{ width: '100%', overflowX: 'auto', borderRadius: 10, padding: 12 }}>
          <svg width={w} height={h} style={{ display: 'block' }}>
            <g transform={`translate(${padL},${padT})`}>
              {tickVals.map((tv, i) => {
                const y = innerH - (tv / (maxVal || 1)) * innerH;
                return (<g key={i}><line x1={-padL} x2={w - padL - padR} y1={y} y2={y} stroke="#f0f0f0" /><text x={-12} y={y + 4} fontSize="10" textAnchor="end">{formatCurrencyBR(tv)}</text></g>);
              })}

              {months.map((m, i) => {
                const x = i * bw;
                const sH = (sales[i] / (maxVal || 1)) * innerH;
                const pH = (payments[i] / (maxVal || 1)) * innerH;
                const uH = (unpaidAmounts[i] / (maxVal || 1)) * innerH;
                const qH = (paidAmounts[i] / (maxVal || 1)) * innerH;

                // divisória posicionada praticamente no final do grupo (por trás das barras)
                const vlineX = bw - (bw * 0.02);

                return (
                  <g key={m} transform={`translate(${x},0)` }>
                    {/* divisória por trás (desenhada antes das barras) */}
                    <line x1={vlineX} x2={vlineX} y1={0} y2={innerH} stroke="#fbfbfc" strokeWidth={1} strokeOpacity={0.85} pointerEvents="none" />

                    {/* barras com offsets e largura ajustada */}
                    <rect x={barOffsets[0] * bw} y={innerH - sH} width={barW} height={sH} fill="#3b82f6" />
                    <rect x={barOffsets[1] * bw} y={innerH - pH} width={barW} height={pH} fill="#10b981" />
                    <rect x={barOffsets[2] * bw} y={innerH - uH} width={barW} height={uH} fill="#ef4444" />
                    <rect x={barOffsets[3] * bw} y={innerH - qH} width={barW} height={qH} fill="#fb923c" />

                    <text x={bw * 0.5} y={innerH + 18} fontSize="10" textAnchor="middle">{formatMonthLabel(m)}</text>
                    <text x={bw * 0.5} y={innerH - Math.max(sH, pH, uH, qH) - 6} fontSize="8" textAnchor="middle">NQ: {unpaidCounts[i]}</text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          {legendItems.map(it => (
            <div key={it.label} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#333' }}>
              <div style={{ width: 12, height: 12, background: it.color, borderRadius: 3 }} />
              <div style={{ maxWidth: 300 }}>{it.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (authLoading) return <div>Carregando autenticação...</div>;
  if (loading) return <div>Carregando dashboard...</div>;

  /* ---------------- render helpers ---------------- */
  const onChangeUsersInstant = (selectedArray) => { setTempSelectedUserIds(selectedArray); setSelectedUserIds(selectedArray); };

  const toggleInfo = (k) => setInfoVisible(prev => ({ ...prev, [k]: !prev[k] }));

  const renderCustomerBlock = (entry, highlight = {}) => {
    const cid = entry.customer.customer_id;
    const controleCliente = entry.customer.controle_customer ?? entry.customer.customer_id;
    return (
      <div key={cid} className="card" style={{ padding: 8, border: '1px solid #eee', marginBottom: 8, borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <strong>{entry.customer.customer_name} ({controleCliente})</strong><br />
            <small>
              {entry.customer.email ? `${entry.customer.email}` : ''}
              {entry.customer.phone ? ` — ${entry.customer.phone}` : ''}
              {isAdmin && entry.customer.created_by ? ` — ${creatorNameMap[entry.customer.created_by] || entry.customer.created_by}` : ''}
            </small>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>Vendas: {formatCurrencyBR(entry.salesSum)}</div>
            <div>Pagamentos: {formatCurrencyBR(entry.paymentsSum)}</div>
            {highlight.pending && <div style={{ fontWeight: 'bold', color: '#b91c1c' }}>Falta: {formatCurrencyBR(entry.pendingAmount)}</div>}
            {highlight.credit && <div style={{ fontWeight: 'bold', color: '#0369a1' }}>Crédito: {formatCurrencyBR(Math.abs(entry.pendingAmount))}</div>}
            <div style={{ marginTop: 6 }}><button onClick={() => toggleExpandCustomer(cid)}>{expandedCustomers[cid] ? 'Fechar vendas' : 'Ver vendas'}</button></div>
          </div>
        </div>

        {expandedCustomers[cid] && (
          <div style={{ marginTop: 8 }}>
            {(!entry.salesRows || entry.salesRows.length === 0) ? <div>Nenhuma venda encontrada.</div> : (
              entry.salesRows.map(s => {
                const sid = s.sale_id;
                const displaySaleId = s.controle_vendas ?? sid;
                const total = Number(s.final_total ?? s.total_amount ?? 0);
                const quitado = isSaleQuitado(s);
                return (
                  <div key={sid} style={{ padding: 6, border: '1px solid #f0f0f0', marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <strong>Venda #{displaySaleId}</strong> — {formatDateDisplay(s.date)}
                        <div style={{ fontSize: 12 }}>
                          <span>Status:&nbsp;
                            <span style={{ fontWeight: 'bold', color: quitado ? '#059669' : '#b91c1c' }}>{quitado ? 'Quitado' : 'Não Quitado'}</span>
                          </span>
                          { (s.discount_real || s.discount_percent) && (<span style={{ marginLeft: 8 }}>— Desconto venda: {s.discount_real ? `${formatCurrencyBR(s.discount_real)}` : ''} {s.discount_percent ? `(${Number(s.discount_percent).toFixed(2)}%)` : ''}</span>)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div>{formatCurrencyBR(total)}</div>
                        <button onClick={() => toggleExpandSale(sid)} style={{ marginTop: 6 }}>{expandedSales[sid] ? 'Fechar itens' : 'Ver itens'}</button>
                      </div>
                    </div>

                    {expandedSales[sid] && (
                      <div style={{ marginTop: 8 }}>
                        {saleItemsCache[sid] ? (
                          saleItemsCache[sid].length === 0 ? <div>Nenhum item.</div> :
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>Item</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #eee' }}>Qty</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #eee' }}>Unit</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #eee' }}>Desconto (R$)</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #eee' }}>Desconto (%)</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #eee' }}>Final</th>
                              </tr>
                            </thead>
                            <tbody>
                              {saleItemsCache[sid].map(it => (
                                <tr key={it.id}>
                                  <td style={{ paddingTop: 6 }}>{it.item || it.description || '—'}</td>
                                  <td style={{ textAlign: 'right' }}>{it.qty}</td>
                                  <td style={{ textAlign: 'right' }}>{formatCurrencyBR(it.unitPrice)}</td>
                                  <td style={{ textAlign: 'right' }}>{formatCurrencyBR(it.discountReal)}</td>
                                  <td style={{ textAlign: 'right' }}>{it.discountPercent ? `${Number(it.discountPercent).toFixed(2)}%` : '-'}</td>
                                  <td style={{ textAlign: 'right' }}>{formatCurrencyBR(it.finalValue)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : <div>Carregando itens...</div>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  };

  /* ---------------- UI ---------------- */

  const rankingTitle = (startDate || endDate)
    ? `Ranking - Período (${startDate ? formatDateDisplay(startDate) : '...'} a ${endDate ? formatDateDisplay(endDate) : '...'})`
    : 'Ranking - Período completo';

  const loggedUserName = creatorNameMap[user?.id] || null;

  return (
    <Layout pageTitle="Dashboard" loggedUserName={loggedUserName}>
      <style>{`
        :root {
          --brand-left: #FDE9B8; /* peach */
          --brand-mid: #F7C6D9; /* pink */
          --brand-purple: #CFA6F7; /* purple */
          --brand-accent: #E77AAE;
          --muted: #6b7280;
          --card-bg: #ffffff;
          --border: #e9e6ea;
          --shadow: 0 8px 24px rgba(15,23,42,0.06);
        }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; box-shadow: var(--shadow); }
        button { background: linear-gradient(90deg, var(--brand-mid), var(--brand-accent)); color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-weight:700; }
        button.small { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 6px 8px; border-radius: 8px; }
        select, input[type="date"], input[type="text"] { border: 1px solid var(--border); padding: 8px; border-radius: 8px; min-width: 160px; }
        .chart-area { background: linear-gradient(180deg, rgba(255,255,255,1), rgba(250,250,252,1)); border: 1px solid #f3f3f3; border-radius: 10px; box-shadow: 0 12px 30px rgba(15,23,42,0.05); }
        .chart-fullwidth:fullscreen, .chart-fullwidth:-webkit-full-screen {
          background: white !important;
          width: 100% !important;
          height: 100% !important;
          padding: 18px !important;
          box-sizing: border-box;
        }
        .status-paid { color: #059669; font-weight: 700; }
        .status-unpaid { color: #b91c1c; font-weight: 700; }

        /* aniversariantes - usa aparência de card para combinar com o dashboard */
        .birthday-box { padding: 8px 10px; min-height: 90px; overflow: auto; }
        .birthday-list { list-style: none; margin: 0; padding: 0; }
        .birthday-list li { padding: 8px 6px; border-bottom: 1px solid #f3f3f3; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .birthday-list li:last-child { border-bottom: none; } /* remove linha do último */
        .birthday-left { display:flex; flex-direction: column; gap:3px; }
        .birthday-name { font-weight: 700; font-size: 14px; }
        .birthday-meta { font-size: 13px; color: #666; }
        .birthday-chip { background: #fafafa; padding: 6px 8px; border-radius: 999px; font-size: 12px; color: #444; border: 1px solid #eee; }

        @media (max-width: 980px) {
          .dashboard-root { padding: 0 12px; }
        }
      `}</style>

      <section style={{ marginBottom: 12 }}>
        <h2>Filtros</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && (
            <div>
              <label>Usuários (multi-select) — altera instantaneamente:</label><br />
              <select multiple size={5} style={{ minWidth: 300 }}
                value={tempSelectedUserIds}
                onChange={e => {
                  const opts = Array.from(e.target.selectedOptions).map(o => o.value);
                  onChangeUsersInstant(opts);
                }}>
                {(creatorList || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label>Filtrar por cliente (ID):</label><br />
            <select value={tempSelectedCustomerId || ''} onChange={e => setTempSelectedCustomerId(e.target.value || null)}>
              <option value=''>Todos</option>
              {(customers || []).map(c => {
                let label = c.customer_name;
                const controleCliente = c.controle_customer ?? c.customer_id;
                if (isAdmin && c.created_by) { label += ` — ${creatorNameMap[c.created_by] || c.created_by}`; }
                return <option key={c.customer_id} value={c.customer_id}>{label} ({controleCliente})</option>;
              })}
            </select>
          </div>

          <div>
            <label>Data Início</label><br />
            <input type="date" value={tempStartDate} onChange={(e) => setTempStartDate(e.target.value)} onKeyDown={preventEnterSubmit} />
          </div>

          <div>
            <label>Data Fim</label><br />
            <input type="date" value={tempEndDate} onChange={(e) => setTempEndDate(e.target.value)} onKeyDown={preventEnterSubmit} />
          </div>

          <div>
            <label>Status das vendas:</label><br />
            <select value={tempSaleStatusFilter} onChange={e => setTempSaleStatusFilter(e.target.value)}>
              <option value="all">Todas</option>
              <option value="quitado">Quitadas</option>
              <option value="nao_quitado">Não Quitadas</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => {
              setSelectedUserIds(Array.isArray(tempSelectedUserIds) ? tempSelectedUserIds : []);
              setSelectedCustomerId(tempSelectedCustomerId || null);
              setStartDate(tempStartDate || '');
              setEndDate(tempEndDate || '');
              setSaleStatusFilter(tempSaleStatusFilter || 'all');
            }}>Buscar</button>

            <button className="small" onClick={() => {
              setTempSelectedUserIds([]); setTempSelectedCustomerId(null); setTempStartDate(''); setTempEndDate(''); setTempSaleStatusFilter('all');
              setSelectedUserIds([]); setSelectedCustomerId(null); setStartDate(''); setEndDate(''); setSaleStatusFilter('all');
            }}>Limpar filtros</button>
          </div>

          {isAdmin && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="small" onClick={handleExportCustomers}>Clientes</button>
              <button className="small" onClick={handleExportSales}>Vendas</button>
              <button className="small" onClick={handleExportSaleItems}>Itens</button>
              <button className="small" onClick={handleExportPayments}>Pagamentos</button>
              <button className="small" onClick={handleExportProfiles}>Usuários</button>
            </div>
          )}
        </div>
      </section>

      {/* Aniversariantes */}
      <section style={{ marginTop: 16 }}>
        <h2>Cliente - Aniversariantes do mês (Desconto de 10% no mês)</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }} className="card birthday-box">
            {birthdaysThisMonth.length === 0 ? <div style={{ padding: 8 }}>Nenhum aniversariante para o mês.</div> :
              <ul className="birthday-list">
                {birthdaysThisMonth.map(c => (
                  <li key={c.customer_id}>
                    <div className="birthday-left">
                      <div className="birthday-name">{c.customer_name}</div>
                      <div className="birthday-meta">{formatDateDisplay(c.birthday)}{c.email ? ` — ${c.email}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {c.phone && <div className="birthday-chip">{c.phone}</div>}
                      {isAdmin && c.created_by && <div style={{ fontSize: 12, color: '#777' }}>{creatorNameMap[c.created_by] || c.created_by}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            }
          </div>

          {isAdmin && (
            <>
              <div style={{ flex: 1 }} className="card birthday-box">
                <h4 style={{ marginTop: 0, marginBottom: 8 }}>Clientes por Usuário</h4>
                {(() => {
                  const byUser = {};
                  (customers || []).forEach(c => { const key = c.created_by || 'unknown'; byUser[key] = byUser[key] || []; byUser[key].push(c); });
                  return Object.entries(byUser).map(([uid, arr]) => {
                    const profileName = creatorNameMap[uid] || uid;
                    return (
                      <div key={uid} style={{ marginBottom: 8, borderBottom: '1px dashed #eee', paddingBottom: 6 }}>
                        <strong>{profileName} ({arr.length})</strong>
                        <div style={{ fontSize: 13 }}>{arr.slice(0, 10).map(c => <div key={c.customer_id}>{c.customer_name} — {c.birthday ? formatDateDisplay(c.birthday) : '—'}</div>)}{arr.length > 10 && <div style={{ color: '#666' }}>+ {arr.length - 10} outros...</div>}</div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div style={{ width: 320 }} className="card birthday-box">
                <h4 style={{ marginTop: 0, marginBottom: 8 }}>Aniversários dos Usuários</h4>
                {userBirthdays.length === 0 ? <div style={{ padding: 8 }}>Sem aniversários de usuários no mês.</div> :
                  <ul className="birthday-list">
                    {userBirthdays.map(u => (
                      <li key={u.id}>
                        <div className="birthday-left">
                          <div className="birthday-name">{u.full_name}</div>
                          <div className="birthday-meta">{formatDateDisplay(u.birthday)}</div>
                        </div>
                        <div />
                      </li>
                    ))}
                  </ul>
                }
              </div>
            </>
          )}
        </div>
      </section>

      {/* Clientes: Pendencias, Créditos, Neutros */}
      <section style={{ marginTop: 24 }}>
        <h2>Clientes e Vendas (expanda para ver vendas / itens)</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h4>Com Pendência</h4>
            {(pendenciasByCustomer || []).length === 0 ? <div>Nenhuma pendência encontrada para o filtro.</div> :
              (pendenciasByCustomer || []).map(p => renderCustomerBlock(p, { pending: true }))
            }
            <div style={{ marginTop: 8, padding: 10, borderTop: '2px solid #ddd' }}>
              <strong>Somatório do grupo (apenas dívidas): {formatCurrencyBR(pendenciasGroupSum)}</strong>
            </div>
          </div>

          <div style={{ width: 360 }}>
            <h4>Com Crédito</h4>
            {(creditList || []).length === 0 ? <div>Sem créditos.</div> : (creditList || []).map(p => renderCustomerBlock(p, { credit: true }))}

            {neutralList.length > 0 && (
              <>
                <h4 style={{ marginTop: 12 }}>Neutro (sem pendência/sem crédito)</h4>
                {neutralList.map(p => renderCustomerBlock(p))}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Controle de Vendas */}
      <section style={{ marginTop: 24 }}>
        <h2>Controle de Vendas</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ margin: 0 }}>Total Vendas</h4>
              <button className="small" onClick={() => toggleInfo('totalSales')} style={{ fontSize: 12, padding: '2px 6px', borderRadius: 999 }}>?</button>
            </div>
            {infoVisible.totalSales && <div style={{ fontSize: 13, marginTop: 6 }}>Total Vendas: representa o valor total das vendas efetuadas dentro do período ou filtro selecionado.</div>}
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#3b82f6', marginTop: 8 }}>{formatCurrencyBR(stats.totalSales)}</div>
          </div>

          <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ margin: 0 }}>Total Recebido</h4>
              <button className="small" onClick={() => toggleInfo('totalPayments')} style={{ fontSize: 12, padding: '2px 6px', borderRadius: 999 }}>?</button>
            </div>
            {infoVisible.totalPayments && <div style={{ fontSize: 13, marginTop: 6 }}>Total Recebido: soma de todos os valores lançados na aba Pagamentos. Pode incluir pagamentos de períodos anteriores.</div>}
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#10b981', marginTop: 8 }}>{formatCurrencyBR(stats.totalPayments)}</div>
          </div>

          <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ margin: 0 }}>Total a Receber</h4>
              <button className="small" onClick={() => toggleInfo('totalToReceive')} style={{ fontSize: 12, padding: '2px 6px', borderRadius: 999 }}>?</button>
            </div>
            {infoVisible.totalToReceive && <div style={{ fontSize: 13, marginTop: 6 }}>Total a Receber: valor do somatório das dívidas do período/filtro selecionado.</div>}
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#7c3aed', marginTop: 8 }}>{formatCurrencyBR(pendenciasGroupSum)}</div>
          </div>

          <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ margin: 0 }}>Vendas Não Quitadas</h4>
              <button className="small" onClick={() => toggleInfo('vendasNaoQuitadas')} style={{ fontSize: 12, padding: '2px 6px', borderRadius: 999 }}>?</button>
            </div>
            {infoVisible.vendasNaoQuitadas && <div style={{ fontSize: 13, marginTop: 6 }}>Vendas Não Quitadas: representa o valor total das vendas que ainda estão com o status “Não Quitada”, dentro do período ou filtro selecionado.</div>}
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#ef4444', marginTop: 8 }}>{formatCurrencyBR(stats.unpaidAmount)}</div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <h4>Vendas Quitadas</h4>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fb923c' }}>{formatCurrencyBR(stats.vendasQuitadas)}</div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <h4>Vendas não quitadas (count)</h4>
            <div style={{ fontSize: 20, fontWeight: 'bold' }}>{Number(stats.unpaidCount || 0)}</div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Chart
            months={chartData.months}
            sales={chartData.sales}
            payments={chartData.payments}
            unpaidCounts={chartData.unpaidCounts}
            unpaidAmounts={chartData.unpaidAmounts}
            paidAmounts={chartData.paidAmounts}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <h4>Recebimentos por método (percentual)</h4>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {paymentMethodBreakdown.map(b => (
              <div key={b.method} className="card" style={{ padding: 8, minWidth: 140 }}>
                <div style={{ fontSize: 14 }}>{b.method}</div>
                <div style={{ fontWeight: 'bold' }}>{formatCurrencyBR(b.total)}</div>
                <div style={{ color: '#666' }}>{Number(b.pct).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rankings */}
      <section style={{ marginTop: 24 }}>
        <h2>{rankingTitle}</h2>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="card" style={{ flex: 1, padding: 12 }}>
            <h4>Top 10 - Maiores Compradores</h4>
            {(() => {
              const topBuyers = (topRankings.topBuyers || []);
              if (topBuyers.length === 0) return <div>Nenhum dado.</div>;
              return (<ol>{topBuyers.map((r) => (<li key={r.customer_id} style={{ marginBottom: 6 }}><strong>{r.name}</strong> — {formatCurrencyBR(r.value)}</li>))}</ol>);
            })()}
          </div>

          <div className="card" style={{ width: 360, padding: 12 }}>
            <h4>Top 10 - Maiores Pendências Financeiras</h4>
            {(() => {
              const topDebtors = (topRankings.topDebtors || []);
              if (topDebtors.length === 0) return <div>Nenhum devedor.</div>;
              return (<ol>{topDebtors.map(r => (<li key={r.customer_id} style={{ marginBottom: 6 }}><strong>{r.name}</strong> — {formatCurrencyBR(r.value)}</li>))}</ol>);
            })()}
          </div>
        </div>
      </section>

    </Layout>
  );
}