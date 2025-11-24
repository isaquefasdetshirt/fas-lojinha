// pages/payments/index.js
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import Layout from '../../components/Layout';

function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
    return d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

export default function PaymentsList() {
  const router = useRouter();
  const { customerId } = router.query;
  const { user: authUser, isAdmin: hookIsAdmin, loading: authLoading } = useAuth();

  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalPurchased, setTotalPurchased] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mode, setMode] = useState('all'); // 'all' | 'customer' | 'period' | 'customer_period'

  // auth/admin
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // creators filter (admin)
  const [creators, setCreators] = useState([]);
  const [creatorNameMap, setCreatorNameMap] = useState({});
  const [createdByFilter, setCreatedByFilter] = useState('');

  const [initialized, setInitialized] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      await init();
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user ?? null;
      setCurrentUser(user);

      if (!user) {
        setPayments([]);
        setCustomers([]);
        setErrorMsg('Sessão expirada. Faça login novamente.');
        setInitialized(true);
        setIsAdmin(false);
        setCreators([]);
        setCreatorNameMap({});
        return;
      }

      let adminFlag = false;
      try {
        const { data: vusers } = await supabase.from('v_app_users').select('role').eq('id', user.id).limit(1);
        if (vusers && vusers.length) adminFlag = String(vusers[0].role || '').toLowerCase().includes('admin');
      } catch {
        const um = user.user_metadata ?? user.app_metadata ?? {};
        const roleFromMetadata = um?.role || um?.roles || um?.is_admin;
        adminFlag = (typeof roleFromMetadata === 'string' && roleFromMetadata.toLowerCase().includes('admin')) || roleFromMetadata === 'admin' || roleFromMetadata === true;
      }
      setIsAdmin(adminFlag);
      if (adminFlag) await populateCreatorsList();
      await loadCustomers(user, adminFlag);

      if (mode === 'all') await fetchAllPayments();
      else {
        const cust = (mode === 'customer' || mode === 'customer_period') ? selectedCustomerId : null;
        await fetchFilteredPayments(cust, startDate, endDate);
      }
    });

    return () => {
      mountedRef.current = false;
      authListener?.subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    try {
      setLoading(true);
      setErrorMsg('');
      const { data: userResp } = await supabase.auth.getUser();
      const user = userResp?.user ?? null;
      setCurrentUser(user);

      let adminFlag = false;
      if (user) {
        try {
          const { data: vusers } = await supabase.from('v_app_users').select('role').eq('id', user.id).limit(1);
          if (vusers && vusers.length) adminFlag = String(vusers[0].role || '').toLowerCase().includes('admin');
          else {
            const um = user.user_metadata ?? user.app_metadata ?? {};
            const roleFromMetadata = um?.role || um?.roles || um?.is_admin;
            adminFlag = (typeof roleFromMetadata === 'string' && roleFromMetadata.toLowerCase().includes('admin')) || roleFromMetadata === 'admin' || roleFromMetadata === true;
          }
        } catch {
          const um = user.user_metadata ?? user.app_metadata ?? {};
          const roleFromMetadata = um?.role || um?.roles || um?.is_admin;
          adminFlag = (typeof roleFromMetadata === 'string' && roleFromMetadata.toLowerCase().includes('admin')) || roleFromMetadata === 'admin' || roleFromMetadata === true;
        }
      }
      setIsAdmin(adminFlag);

      await loadCustomers(user, adminFlag);

      if (adminFlag) await populateCreatorsList();

      if (customerId) {
        setSelectedCustomerId(customerId);
        setMode('customer');
        await fetchFilteredPayments(customerId, startDate, endDate);
      } else {
        await fetchAllPayments();
      }
    } catch (err) {
      console.error('[init]', err);
      setErrorMsg('Erro na inicialização: ' + (err.message || err));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setInitialized(true);
      }
    }
  }

  async function loadCustomers(userParam = null, adminFlagParam = null) {
    try {
      let user = userParam;
      if (!user) {
        const { data: userResp } = await supabase.auth.getUser();
        user = userResp?.user ?? null;
      }
      let adminFlag = adminFlagParam;
      if (adminFlag === null || adminFlag === undefined) adminFlag = isAdmin;

      let q = supabase.from('customers').select('customer_id, customer_name, created_by').order('customer_name');
      if (!adminFlag) {
        if (user?.id) q = q.eq('created_by', user.id);
        else {
          if (mountedRef.current) setCustomers([]);
          return;
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      if (!mountedRef.current) return;
      setCustomers(data || []);
    } catch (err) {
      console.error('[loadCustomers]', err);
      setErrorMsg('Erro ao carregar clientes.');
      if (mountedRef.current) setCustomers([]);
    }
  }

  async function populateCreatorsList() {
    try {
      const { data: rows, error } = await supabase.from('payments').select('created_by').not('created_by', 'is', null).limit(2000);
      if (error) { console.warn('[populateCreatorsList] erro', error); setCreators([]); return; }
      const uniq = [...new Set((rows || []).map(r => r.created_by).filter(Boolean))];
      if (uniq.length === 0) { setCreators([]); setCreatorNameMap({}); return; }

      let nameMap = {};
      try {
        const { data: vusers } = await supabase.from('v_app_users').select('id, full_name').in('id', uniq);
        if (vusers) vusers.forEach(u => { nameMap[u.id] = u.full_name || u.id; });
      } catch (e) {
        console.warn('[populateCreatorsList] v_app_users falhou', e);
      }

      if (Object.keys(nameMap).length === 0) {
        try {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', uniq);
          if (profiles) profiles.forEach(p => { nameMap[p.id] = p.full_name || p.id; });
        } catch (e) {
          console.warn('[populateCreatorsList] profiles falhou', e);
        }
      }

      const list = uniq.map(id => ({ id, name: nameMap[id] || id }));
      if (mountedRef.current) {
        setCreators(list);
        setCreatorNameMap(nameMap);
      }
    } catch (err) {
      console.error('[populateCreatorsList] erro', err);
      setCreators([]);
      setCreatorNameMap({});
    }
  }

  async function fetchAllPayments() {
    if (!mountedRef.current) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const { data: userResp } = await supabase.auth.getUser();
      const user = userResp?.user ?? null;

      if (!user) {
        setPayments([]);
        setTotalPaid(0);
        setTotalPurchased(0);
        setErrorMsg('Usuário não autenticado. Faça login.');
        return;
      }

      let base = supabase
        .from('payments')
        .select(`
          payment_id,
          controle_pagamentos,
          customer_id,
          amount,
          date,
          method,
          notes,
          created_by,
          customers(customer_name)
        `)
        .order('date', { ascending: false })
        .limit(500);

      if (isAdmin) {
        if (createdByFilter) base = base.eq('created_by', createdByFilter);
      } else {
        base = base.eq('created_by', user.id);
      }

      const { data, error } = await base;
      if (error) throw error;
      if (!mountedRef.current) return;
      setPayments(data || []);
      const paid = (data || []).reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
      setTotalPaid(paid);
      setTotalPurchased(0);
    } catch (err) {
      console.error('[fetchAllPayments]', err);
      setErrorMsg('Erro ao carregar pagamentos: ' + (err.message || err));
      setPayments([]);
      setTotalPaid(0);
      setTotalPurchased(0);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function fetchFilteredPayments(custId, start = '', end = '') {
    if (!mountedRef.current) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const { data: userResp } = await supabase.auth.getUser();
      const user = userResp?.user ?? null;

      if (!user) {
        setPayments([]);
        setTotalPaid(0);
        setTotalPurchased(0);
        setErrorMsg('Usuário não autenticado. Faça login.');
        return;
      }

      let query = supabase
        .from('payments')
        .select(`
          payment_id,
          controle_pagamentos,
          customer_id,
          amount,
          date,
          method,
          notes,
          created_by,
          customers(customer_name)
        `)
        .order('date', { ascending: false });

      if (custId) query = query.eq('customer_id', custId);
      if (start) query = query.gte('date', start);
      if (end) query = query.lte('date', end);

      if (isAdmin) {
        if (createdByFilter) query = query.eq('created_by', createdByFilter);
      } else {
        query = query.eq('created_by', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!mountedRef.current) return;

      setPayments(data || []);
      const paid = (data || []).reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
      setTotalPaid(paid);

      if (custId) {
        const purchased = await computeTotalPurchasedForCustomer(custId, start, end);
        setTotalPurchased(purchased);
      } else {
        setTotalPurchased(0);
      }
    } catch (err) {
      console.error('[fetchFilteredPayments]', err);
      setErrorMsg('Erro ao filtrar pagamentos: ' + (err.message || err));
      setPayments([]);
      setTotalPaid(0);
      setTotalPurchased(0);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function computeTotalPurchasedForCustomer(custId, start = '', end = '') {
    try {
      let q = supabase.from('sales').select('*').order('sale_id', { ascending: false });
      q = q.eq('customer_id', custId);
      if (start) q = q.gte('date', start);
      if (end) q = q.lte('date', end);
      const { data, error } = await q;
      if (error) {
        console.warn('[computeTotalPurchasedForCustomer] erro ao buscar sales:', error.message || error);
        return 0;
      }
      if (!data || data.length === 0) return 0;

      const candidates = ['final_total', 'total', 'amount', 'sale_total', 'total_amount', 'grand_total', 'value', 'valor', 'total_value'];

      let sum = 0;
      for (const row of data) {
        let found = false;
        for (const c of candidates) {
          if (Object.prototype.hasOwnProperty.call(row, c)) {
            const v = parseFloat(row[c]);
            if (!Number.isNaN(v)) {
              sum += v;
              found = true;
              break;
            }
          }
        }
        if (!found) {
          for (const k of Object.keys(row)) {
            const v = parseFloat(row[k]);
            if (!Number.isNaN(v)) {
              sum += v;
              found = true;
              break;
            }
          }
        }
      }
      return sum;
    } catch (err) {
      console.error('[computeTotalPurchasedForCustomer] exception', err);
      return 0;
    }
  }

  function handleSearch() {
    setErrorMsg('');
    if (mode === 'all') {
      fetchAllPayments();
      router.push('/payments', undefined, { shallow: true });
      return;
    }
    if ((mode === 'customer' || mode === 'customer_period') && !selectedCustomerId) {
      setErrorMsg('Selecione um cliente.');
      return;
    }
    if ((mode === 'period') && !startDate && !endDate) {
      setErrorMsg('Defina início e/ou fim do período.');
      return;
    }

    let cust = null;
    if (mode === 'customer' || mode === 'customer_period') cust = selectedCustomerId;
    if (mode === 'period') cust = null;
    fetchFilteredPayments(cust, startDate, endDate);

    if (cust) router.push({ pathname: '/payments', query: { customerId: cust } }, undefined, { shallow: true });
    else router.push('/payments', undefined, { shallow: true });
  }

  function handleClear() {
    setMode('all');
    setSelectedCustomerId('');
    setStartDate('');
    setEndDate('');
    setErrorMsg('');
    setCreatedByFilter('');
    fetchAllPayments();
    router.push('/payments', undefined, { shallow: true });
  }

  async function handleDelete(paymentId, createdBy) {
    const ok = window.confirm('Tem certeza que deseja excluir este pagamento? Esta ação é irreversível.');
    if (!ok) return;

    try {
      setLoading(true);
      const { error } = await supabase.from('payments').delete().eq('payment_id', paymentId);
      if (error) throw error;
      if (mode === 'all') await fetchAllPayments();
      else {
        const cust = (mode === 'customer' || mode === 'customer_period') ? selectedCustomerId : null;
        await fetchFilteredPayments(cust, startDate, endDate);
      }
    } catch (err) {
      console.error('[handleDelete]', err);
      alert('Erro ao excluir pagamento: ' + (err.message || err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function onCreatorChange(e) {
    const val = e.target.value || '';
    setCreatedByFilter(val);
    if (mode === 'all') await fetchAllPayments();
    else {
      const cust = (mode === 'customer' || mode === 'customer_period') ? selectedCustomerId : null;
      await fetchFilteredPayments(cust, startDate, endDate);
    }
  }

  async function handleRefresh() {
    if (mode === 'all') {
      await fetchAllPayments();
    } else {
      const cust = (mode === 'customer' || mode === 'customer_period') ? selectedCustomerId : null;
      await fetchFilteredPayments(cust, startDate, endDate);
    }
  }

  if (authLoading) {
    return <div>Carregando autenticação...</div>;
  }

  return (
    <Layout pageTitle="Pagamentos">
      <div style={{ maxWidth: 1100 }}>
        <style>{`
          :root {
            --brand-left: #FDE9B8;
            --brand-mid: #F7C6D9;
            --brand-accent: #E77AAE;
            --muted: #6b7280;
            --card-bg: #ffffff;
            --border: #e9e6ea;
            --shadow: 0 8px 24px rgba(15,23,42,0.06);
          }
          .badge { background: #f3f4f6; padding: 6px 10px; border-radius: 8px; display:flex; align-items:center; gap:6px; }
          .btn { background: linear-gradient(90deg, var(--brand-mid), var(--brand-accent)); color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-weight:700; }
          .input { border: 1px solid var(--border); padding: 8px; border-radius: 8px; }
        `}</style>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Pagamentos</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="badge">Total pago: <strong style={{ marginLeft: 6 }}>R$ {totalPaid.toFixed(2)}</strong></div>
            <button className="btn" onClick={handleRefresh}>Atualizar</button>
            <Link href="/payments/new">
              <button className="btn primary" style={{ marginLeft: 8 }}>Novo Pagamento</button>
            </Link>
          </div>
        </div>

        {/* Search / filters area */}
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 8 }}>Modo de busca:</label>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="all">Todos (mostrar tudo)</option>
              <option value="customer">Por cliente</option>
              <option value="period">Por período</option>
              <option value="customer_period">Cliente + período</option>
            </select>
          </div>

          <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div>
              <label>Cliente</label>
              <select className="input" value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} disabled={mode === 'all' || mode === 'period'}>
                <option value="">-- selecione --</option>
                {customers.map(c => {
                  let label = c.customer_name;
                  if (isAdmin && c.created_by) {
                    if (currentUser && c.created_by === currentUser.id) label += ' (me)';
                    else label += ` — ${creatorNameMap[c.created_by] || c.created_by}`;
                  }
                  return <option key={c.customer_id} value={c.customer_id}>{label}</option>;
                })}
              </select>
            </div>

            <div>
              <label>Data Início</label>
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={mode === 'all' || mode === 'customer'} />
            </div>

            <div>
              <label>Data Fim</label>
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={mode === 'all' || mode === 'customer'} />
            </div>

            {isAdmin && (
              <div>
                <label>Criador</label>
                <select className="input" value={createdByFilter} onChange={onCreatorChange}>
                  <option value="">-- todos --</option>
                  {creators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button className="btn" onClick={handleSearch}>Buscar</button>
              <button className="btn" onClick={handleClear}>Limpar</button>
            </div>
          </div>
        </div>

        {(!initialized || loading) ? <div>Carregando...</div> : (
          <>
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 8 }}>ID</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Cliente</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Data</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Valor</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Método</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
                    {isAdmin && <th style={{ textAlign: 'left', padding: 8 }}>Criado por</th>}
                    <th style={{ textAlign: 'left', padding: 8 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => {
                    const paymentId = p.payment_id;
                    const displayId = (p.controle_pagamentos !== undefined && p.controle_pagamentos !== null) ? p.controle_pagamentos : paymentId;
                    const customerName = p.customers?.customer_name || '—';
                    const amount = parseFloat(p.amount) || 0;
                    const method = p.method || '—';
                    const status = 'Ativo';
                    return (
                      <tr key={paymentId}>
                        <td style={{ padding: 8 }}>{displayId}</td>
                        <td style={{ padding: 8 }}>{customerName}</td>
                        <td style={{ padding: 8 }}>{formatDateDisplay(p.date)}</td>
                        <td style={{ padding: 8 }}>R$ {amount.toFixed(2)}</td>
                        <td style={{ padding: 8 }}>{method}</td>
                        <td style={{ padding: 8 }}>{status}</td>
                        {isAdmin && (
                          <td style={{ padding: 8 }}>{creatorNameMap[p.created_by] || (p.created_by || '—')}</td>
                        )}
                        <td style={{ padding: 8 }}>
                          {paymentId && (
                            <>
                              <Link href={`/payments/${paymentId}/edit`}><button className="btn">Editar</button></Link>{' '}
                              {(isAdmin || (currentUser && currentUser.id === p.created_by)) && (
                                <button className="btn" onClick={() => handleDelete(paymentId, p.created_by)} style={{ marginLeft: 8 }}>Excluir</button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {payments.length === 0 && (
                    <tr><td colSpan={isAdmin ? 8 : 7} style={{ padding: 8 }}>Nenhum pagamento encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontWeight: 'bold' }}>
              <div>Total pago: R$ {totalPaid.toFixed(2)}</div>
              <div>Total comprado: R$ {totalPurchased.toFixed(2)}</div>
            </div>
          </>
        )}

        {errorMsg && <div style={{ marginTop: 12, color: '#9f1239' }}>{errorMsg}</div>}
      </div>
    </Layout>
  );
}