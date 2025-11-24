// pages/sales/index.js
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

export default function SalesList() {
  const router = useRouter();
  const { customerId } = router.query;

  const { user, isAdmin: hookIsAdmin, loading: authLoading } = useAuth();

  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalSales, setTotalSales] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mode, setMode] = useState('all'); // 'all' | 'customer' | 'period' | 'customer_period'

  const [isAdmin, setIsAdmin] = useState(false);
  const [creators, setCreators] = useState([]);
  const [creatorNameMap, setCreatorNameMap] = useState({});
  const [createdByFilter, setCreatedByFilter] = useState('');

  const [initialized, setInitialized] = useState(false);
  const mountedRef = useRef(true);

  // simples controle de loading por linha ao atualizar pago
  const [updatingIds, setUpdatingIds] = useState([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    mountedRef.current = true;
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  async function init() {
    try {
      setLoading(true);
      setErrorMsg('');

      // determina adminFlag (usa hook ou query fallback)
      let adminFlag = Boolean(hookIsAdmin);
      if (!adminFlag && user) {
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

      // Load customers
      await loadCustomers(user, adminFlag);

      // Populate creators list for admin filter
      if (adminFlag) await populateCreatorsList();

      if (customerId) {
        setSelectedCustomerId(customerId);
        setMode('customer');
        await fetchFilteredSales(customerId, startDate, endDate, adminFlag);
      } else {
        await fetchAllSales(adminFlag);
      }
    } catch (err) {
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
      let u = userParam ?? user;
      let adminFlag = adminFlagParam;
      if (adminFlag === null || adminFlag === undefined) adminFlag = isAdmin;

      let q = supabase.from('customers').select('customer_id, customer_name, created_by').order('customer_name');
      if (!adminFlag) {
        if (u?.id) q = q.eq('created_by', u.id);
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
      setErrorMsg('Erro ao carregar clientes.');
      if (mountedRef.current) setCustomers([]);
    }
  }

  async function populateCreatorsList() {
    try {
      const { data: rows, error } = await supabase.from('sales').select('created_by').not('created_by', 'is', null).limit(2000);
      if (error) { setCreators([]); setCreatorNameMap({}); return; }
      const uniq = [...new Set((rows || []).map(r => r.created_by).filter(Boolean))];

      if (user?.id && !uniq.includes(user.id)) uniq.unshift(user.id);

      if (uniq.length === 0) { setCreators([]); setCreatorNameMap({}); return; }

      let nameMap = {};
      try {
        const { data: vusers } = await supabase.from('v_app_users').select('id, full_name').in('id', uniq);
        if (vusers) vusers.forEach(u => { nameMap[u.id] = u.full_name || u.id; });
      } catch {}

      const missing = uniq.filter(id => !nameMap[id]);
      if (missing.length > 0) {
        try {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', missing);
          if (profiles) profiles.forEach(p => { nameMap[p.id] = p.full_name || p.id; });
        } catch {}
      }

      if (user?.id && !nameMap[user.id]) {
        nameMap[user.id] = 'Eu';
      }

      const list = uniq.map(id => ({ id, name: nameMap[id] || id }));
      if (mountedRef.current) {
        setCreators(list);
        setCreatorNameMap(nameMap);
      }
    } catch (err) {
      setCreators([]);
      setCreatorNameMap({});
    }
  }

  async function fetchAllSales(adminFlagParam = null) {
    if (!mountedRef.current) return;
    setLoading(true);
    setErrorMsg('');
    try {
      if (!user) {
        setSales([]);
        setTotalSales(0);
        setErrorMsg('Usuário não autenticado. Faça login.');
        return;
      }

      let adminFlag = adminFlagParam;
      if (adminFlag === null || adminFlag === undefined) adminFlag = isAdmin;

      const base = supabase
        .from('sales')
        .select(`
          sale_id,
          controle_vendas,
          customer_id,
          date,
          total_amount,
          final_total,
          pago,
          created_by,
          customers(customer_name)
        `)
        .order('sale_id', { ascending: false })
        .limit(500);

      let q = base;
      if (adminFlag) {
        if (createdByFilter) q = q.eq('created_by', createdByFilter);
      } else {
        q = q.eq('created_by', user.id);
      }

      const { data, error } = await q;
      if (error) throw error;
      if (!mountedRef.current) return;
      setSales(data || []);

      const sum = (data || []).reduce((acc, s) => {
        const v = s.final_total ?? s.total_amount ?? 0;
        return acc + (parseFloat(v) || 0);
      }, 0);
      setTotalSales(sum);
    } catch (err) {
      setErrorMsg('Erro ao carregar vendas: ' + (err.message || err));
      setSales([]);
      setTotalSales(0);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function fetchFilteredSales(custId, start = '', end = '', adminFlagParam = null) {
    if (!mountedRef.current) return;
    setLoading(true);
    setErrorMsg('');
    try {
      if (!user) {
        setSales([]);
        setTotalSales(0);
        setErrorMsg('Usuário não autenticado. Faça login.');
        return;
      }

      let adminFlag = adminFlagParam;
      if (adminFlag === null || adminFlag === undefined) adminFlag = isAdmin;

      let query = supabase
        .from('sales')
        .select(`
          sale_id,
          controle_vendas,
          customer_id,
          date,
          total_amount,
          final_total,
          pago,
          created_by,
          customers(customer_name)
        `)
        .order('sale_id', { ascending: false });

      if (custId) query = query.eq('customer_id', custId);
      if (start) query = query.gte('date', start);
      if (end) query = query.lte('date', end);

      if (adminFlag) {
        if (createdByFilter) query = query.eq('created_by', createdByFilter);
      } else {
        query = query.eq('created_by', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!mountedRef.current) return;

      setSales(data || []);
      const sum = (data || []).reduce((acc, s) => {
        const v = s.final_total ?? s.total_amount ?? 0;
        return acc + (parseFloat(v) || 0);
      }, 0);
      setTotalSales(sum);
    } catch (err) {
      setErrorMsg('Erro ao filtrar vendas: ' + (err.message || err));
      setSales([]);
      setTotalSales(0);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function handleDelete(saleId, createdBy) {
    const ok = window.confirm('Tem certeza que deseja excluir esta venda? Esta ação é irreversível.');
    if (!ok) return;

    try {
      setLoading(true);
      // delete items first
      const { error: itemsError } = await supabase.from('sale_items').delete().eq('sale_id', saleId);
      if (itemsError) throw itemsError;

      const { error } = await supabase.from('sales').delete().eq('sale_id', saleId);
      if (error) throw error;

      if (mode === 'all') await fetchAllSales();
      else {
        const cust = (mode === 'customer' || mode === 'customer_period') ? selectedCustomerId : null;
        await fetchFilteredSales(cust, startDate, endDate);
      }
    } catch (err) {
      alert('Erro ao excluir venda: ' + (err.message || err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function togglePagoStatus(saleId) {
    try {
      setUpdatingIds(prev => [...prev, saleId]);

      // Lê o valor atual apenas para confirmação visual (opcional)
      const { data: currentRow, error: readErr } = await supabase
        .from('sales')
        .select('pago')
        .eq('sale_id', saleId)
        .single();

      const current = currentRow?.pago === true;
      const newValue = !current;

      const confirmText = newValue ? 'Marcar como QUITADO?' : 'Marcar como NÃO QUITADO?';
      if (!window.confirm(confirmText)) {
        setUpdatingIds(prev => prev.filter(id => id !== saleId));
        return;
      }

      // Atualiza e pede a linha atualizada de volta
      const { data: updatedRow, error: updateErr } = await supabase
        .from('sales')
        .update({ pago: newValue })
        .eq('sale_id', saleId)
        .select(`
          sale_id,
          controle_vendas,
          customer_id,
          date,
          total_amount,
          final_total,
          pago,
          created_by,
          customers(customer_name)
        `)
        .single();

      if (updateErr) {
        alert('Erro ao atualizar pagamento: ' + (updateErr.message || updateErr));
        setUpdatingIds(prev => prev.filter(id => id !== saleId));
        return;
      }

      // Substitui a linha no estado com o retorno do DB
      setSales(prev => prev.map(s => s.sale_id === saleId ? updatedRow : s));
    } catch (err) {
      alert('Erro inesperado: ' + (err.message || err));
    } finally {
      setUpdatingIds(prev => prev.filter(id => id !== saleId));
    }
  }

  async function onCreatorChange(e) {
    const val = e.target.value || '';
    setCreatedByFilter(val);
    if (mode === 'all') await fetchAllSales();
    else {
      const cust = (mode === 'customer' || mode === 'customer_period') ? selectedCustomerId : null;
      await fetchFilteredSales(cust, startDate, endDate);
    }
  }

  function handleSearch() {
    setErrorMsg('');
    if (mode === 'all') {
      fetchAllSales();
      router.push('/sales', undefined, { shallow: true });
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
    fetchFilteredSales(cust, startDate, endDate);

    if (cust) router.push({ pathname: '/sales', query: { customerId: cust } }, undefined, { shallow: true });
    else router.push('/sales', undefined, { shallow: true });
  }

  function handleClear() {
    setMode('all');
    setSelectedCustomerId('');
    setStartDate('');
    setEndDate('');
    setErrorMsg('');
    setCreatedByFilter('');
    fetchAllSales();
    router.push('/sales', undefined, { shallow: true });
  }

  if (authLoading) {
    return <div>Carregando autenticação...</div>;
  }

  const loggedUserName = null; // deixar Layout decidir

  return (
    <Layout pageTitle="Vendas" loggedUserName={loggedUserName}>
      <style>{`
        :root {
          --card-bg: #ffffff;
          --border: #e9e6ea;
          --brand-start: #FDE9B8;
          --brand-end: #E77AAE;
        }
        .page { max-width: 1100px; margin: 0 auto; padding: 20px; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; box-shadow: 0 8px 24px rgba(15,23,42,0.04); }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; border-bottom: 1px solid #f3f3f3; }
        button { background: linear-gradient(90deg,var(--brand-start),var(--brand-end)); color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
        button.small { background: transparent; border: 1px solid var(--border); color: #666; }
        select, input { padding: 8px; border-radius: 8px; border: 1px solid var(--border); }
      `}</style>

      <div className="page">
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Vendas</h1>

          {errorMsg && <div style={{ color: 'red', marginBottom: 12 }}>{errorMsg}</div>}

          <div style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 8 }}>Modo de busca:</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
              <option value="all">Todos (mostrar tudo)</option>
              <option value="customer">Por cliente</option>
              <option value="period">Por período</option>
              <option value="customer_period">Cliente + período</option>
            </select>
          </div>

          <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div>
              <label>Cliente</label><br />
              <select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} disabled={mode === 'all' || mode === 'period'} style={{ padding: 8, borderRadius: 8 }}>
                <option value="">-- selecione --</option>
                {customers.map(c => {
                  let label = c.customer_name;
                  if (isAdmin && c.created_by) {
                    if (user && c.created_by === user.id) label += ' (me)';
                    else label += ` — ${creatorNameMap[c.created_by] || c.created_by}`;
                  }
                  return <option key={c.customer_id} value={c.customer_id}>{label}</option>;
                })}
              </select>
            </div>

            <div>
              <label>Data Início</label><br />
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={mode === 'all' || mode === 'customer'} />
            </div>

            <div>
              <label>Data Fim</label><br />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={mode === 'all' || mode === 'customer'} />
            </div>

            {isAdmin && (
              <div>
                <label>Criador</label><br />
                <select value={createdByFilter} onChange={onCreatorChange} style={{ padding: 8, borderRadius: 8 }}>
                  <option value="">-- todos --</option>
                  {creators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button onClick={handleSearch}>Buscar</button>
              <button onClick={handleClear} className="small">Limpar</button>
              <Link href="/sales/new"><button>Nova Venda</button></Link>
            </div>
          </div>

          {(!initialized || loading) ? <div>Carregando...</div> : (
            <>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Nº Venda</th>
                    <th style={{ textAlign: 'left' }}>Cliente</th>
                    <th style={{ textAlign: 'left' }}>Data</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'left' }}>Pagamento</th>
                    {isAdmin && <th style={{ textAlign: 'left' }}>Criado por</th>}
                    <th style={{ textAlign: 'left' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => {
                    const id = s.sale_id;
                    const displayId = s.controle_vendas ?? id;
                    const customerName = s.customers?.customer_name || '—';
                    const total = parseFloat(s.final_total ?? s.total_amount ?? 0) || 0;
                    const pago = s.pago === true;
                    const isUpdating = updatingIds.includes(id);

                    return (
                      <tr key={id}>
                        <td>{displayId}</td>
                        <td>{customerName}</td>
                        <td>{formatDateDisplay(s.date)}</td>
                        <td style={{ textAlign: 'right' }}>R$ {total.toFixed(2)}</td>

                        <td>
                          <button
                            onClick={() => togglePagoStatus(id)}
                            disabled={isUpdating}
                            style={{
                              background: pago ? '#4CAF50' : '#f44336',
                              color: 'white',
                              border: 'none',
                              padding: '6px 10px',
                              borderRadius: 6,
                              cursor: isUpdating ? 'wait' : 'pointer',
                              opacity: isUpdating ? 0.7 : 1
                            }}
                            title={isUpdating ? 'Atualizando...' : (pago ? 'Quitado' : 'Não Quitado')}
                          >
                            {isUpdating ? 'Atualizando...' : (pago ? 'Quitado' : 'Não Quitado')}
                          </button>
                        </td>

                        {isAdmin && (
                          <td>{creatorNameMap[s.created_by] || (s.created_by || '—')}</td>
                        )}
                        <td>
                          <Link href={`/sales/${id}/edit`}><button>Editar</button></Link>{' '}
                          {(isAdmin || (user && user.id === s.created_by)) && (
                            <button onClick={() => handleDelete(id, s.created_by)} style={{ marginLeft: 8 }}>Excluir</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {sales.length === 0 && (
                    <tr><td colSpan={isAdmin ? 7 : 6} style={{ padding: 8 }}>Nenhuma venda encontrada.</td></tr>
                  )}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontWeight: 'bold', marginTop: 12 }}>
                <div>Total vendas: R$ {totalSales.toFixed(2)}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}