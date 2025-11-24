// pages/customers/index.js
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

export default function CustomersPage() {
  const router = useRouter();
  const { returnTo } = router.query;
  const { user, isAdmin: hookIsAdmin, loading: authLoading } = useAuth();

  const [customers, setCustomers] = useState([]);
  const [creatorNameMap, setCreatorNameMap] = useState({});
  const [creators, setCreators] = useState([]);
  const [createdByFilter, setCreatedByFilter] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const mountedRef = useRef(true);

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

      let adminFlag = Boolean(hookIsAdmin);
      if (!adminFlag && user) {
        try {
          const { data: vusers } = await supabase.from('v_app_users').select('role').eq('id', user.id).limit(1);
          if (vusers && vusers.length) adminFlag = String(vusers[0].role || '').toLowerCase().includes('admin');
        } catch {
          adminFlag = Boolean(hookIsAdmin);
        }
      }
      setIsAdmin(adminFlag);

      if (adminFlag) await populateCreatorsList();

      // fetch without search initially
      await fetchCustomers('', user, adminFlag, createdByFilter);
      await fetchTotalCount('', user, adminFlag, createdByFilter);
    } catch (err) {
      console.error('[init] erro', err);
      setErrorMsg('Erro na inicialização: ' + (err.message || err));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setInitialized(true);
      }
    }
  }

  async function populateCreatorsList() {
    try {
      const { data: rows, error } = await supabase.from('customers').select('created_by').not('created_by', 'is', null).limit(2000);
      if (error) { console.warn('[populateCreatorsList] erro', error); setCreators([]); return; }
      const uniq = [...new Set((rows || []).map(r => r.created_by).filter(Boolean))];
      if (uniq.length === 0) { setCreators([]); return; }

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
      setCreators(list);
      setCreatorNameMap(nameMap);
    } catch (err) {
      console.error('[populateCreatorsList] erro', err);
      setCreators([]);
      setCreatorNameMap({});
    }
  }

  // NOTE: performs server fetch (filtered by creator/auth) and then client-side substring filtering for partial matches
  async function fetchCustomers(search = '', userParam = null, adminFlag = null, creator = createdByFilter) {
    if (mountedRef.current) setLoading(true);
    try {
      // ensure we have a user object (if not passed in, fetch current)
      let effectiveUser = userParam;
      if (!effectiveUser) {
        try {
          const { data: userResp } = await supabase.auth.getUser();
          effectiveUser = userResp?.user ?? null;
        } catch (e) {
          effectiveUser = null;
        }
      }

      let base = supabase
        .from('customers')
        .select('customer_id, controle_customer, customer_name, phone, birthday, email, city, created_by')
        .order('customer_name', { ascending: true })
        .limit(1000);

      // apply creator filter/auth filter BEFORE fetching
      if (adminFlag === null || adminFlag === undefined) adminFlag = isAdmin;
      if (!adminFlag) {
        if (effectiveUser?.id) base = base.eq('created_by', effectiveUser.id);
        else { if (mountedRef.current) setCustomers([]); return []; }
      } else {
        if (creator) base = base.eq('created_by', creator);
      }

      const res = await base;
      const { data, error } = res;
      if (error) throw error;
      if (!mountedRef.current) return [];

      let final = data || [];

      // If search provided, do client-side substring (case-insensitive) filtering
      if (search && search.trim()) {
        const term = search.trim().toLowerCase();
        final = final.filter(d => {
          // consider the searchable fields: customer_name, phone, email, city
          const fields = [
            d.customer_name,
            d.phone,
            d.email,
            d.city
          ];
          return fields.some(f => f && String(f).toLowerCase().includes(term));
        });
      }

      // Update creatorNameMap for admin view if needed (same logic as before)
      if (adminFlag) {
        const ids = [...new Set((final || []).map(d => d.created_by).filter(Boolean))];
        const missing = ids.filter(id => !creatorNameMap[id]);
        if (missing.length) {
          try {
            const { data: vusers } = await supabase.from('v_app_users').select('id, full_name').in('id', missing);
            const newMap = { ...creatorNameMap };
            if (vusers) vusers.forEach(u => { newMap[u.id] = u.full_name || u.id; });
            const stillMissing = missing.filter(id => !newMap[id]);
            if (stillMissing.length) {
              const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', stillMissing);
              if (profiles) profiles.forEach(p => { newMap[p.id] = p.full_name || p.id; });
            }
            setCreatorNameMap(newMap);
          } catch (e) {
            console.warn('[fetchCustomers] atualizacao creatorNameMap falhou', e);
          }
        }
      }

      setCustomers(final);
      return final;
    } catch (err) {
      console.error('[fetchCustomers] erro', err);
      if (mountedRef.current) setCustomers([]);
      return [];
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  // fetchTotalCount: if search present, reuse client-side filtering result to count
  async function fetchTotalCount(search = '', userParam = null, adminFlag = null, creator = createdByFilter) {
    try {
      if (search && search.trim()) {
        // use fetchCustomers to obtain filtered set and set the count from it
        const res = await fetchCustomers(search, userParam, adminFlag, creator);
        setTotalCount(res ? res.length : 0);
        return;
      }

      let qcount = supabase.from('customers').select('*', { count: 'exact', head: true });
      if (!adminFlag) {
        if (userParam?.id) qcount = qcount.eq('created_by', userParam.id);
        else if (user?.id) qcount = qcount.eq('created_by', user.id);
        else { setTotalCount(0); return; }
      } else {
        if (creator) qcount = qcount.eq('created_by', creator);
      }
      const res = await qcount;
      const { count, error } = res;
      if (error) throw error;
      setTotalCount(count || 0);
    } catch (err) {
      console.error('[fetchTotalCount] erro', err);
      setTotalCount(0);
    }
  }

  async function handleSearch(e) {
    e?.preventDefault();
    const res = await fetchCustomers(q);
    setTotalCount(res ? res.length : 0);
  }

  async function onCreatorChange(e) {
    const val = e.target.value || '';
    setCreatedByFilter(val);
    await fetchCustomers('', user, isAdmin, val);
    await fetchTotalCount('', user, isAdmin, val);
  }

  if (authLoading) {
    return <div>Carregando autenticação...</div>;
  }

  return (
    <Layout pageTitle="Clientes">
      <div style={{ maxWidth: 1000 }}>
        {/* Adiciona estilos locais iguais aos de payments/index para garantir consistência visual */}
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
          .btn.primary { margin-left: 8px; }
          .input { border: 1px solid var(--border); padding: 8px; border-radius: 8px; }
        `}</style>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Clientes</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="badge">Total: <strong style={{ marginLeft: 6 }}>{totalCount}</strong></div>
            <button className="btn" onClick={async () => { await fetchCustomers('', user, isAdmin, createdByFilter); await fetchTotalCount('', user, isAdmin, createdByFilter); }}>Atualizar</button>
            <Link href={{ pathname: '/customers/new', query: returnTo ? { returnTo } : {} }}>
              <button className="btn primary">Cadastrar cliente</button>
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" placeholder="Pesquisar por nome, telefone, email ou cidade" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '55%' }} />
            {isAdmin && (
              <select className="input" value={createdByFilter} onChange={onCreatorChange} style={{ width: 220 }}>
                <option value="">-- Todos os criadores --</option>
                {creators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button className="btn" type="submit">Buscar</button>
            <button className="btn" type="button" onClick={async () => { setQ(''); setCreatedByFilter(''); await fetchCustomers('', user, isAdmin, ''); await fetchTotalCount('', user, isAdmin, ''); }}>Limpar</button>
          </form>
        </div>

        {(!initialized || loading) ? (
          <div>Carregando...</div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>#</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Nome</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Telefone</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Aniversário</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Email</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Cidade</th>
                  {isAdmin && <th style={{ textAlign: 'left', padding: 8 }}>Criado por</th>}
                  <th style={{ textAlign: 'left', padding: 8 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.customer_id} style={{ borderTop: '1px solid #f3f3f3' }}>
                    <td style={{ padding: 8 }}>{c.controle_customer}</td>
                    <td style={{ padding: 8 }}>{c.customer_name}</td>
                    <td style={{ padding: 8 }}>{c.phone || '—'}</td>
                    <td style={{ padding: 8 }}>{formatDateDisplay(c.birthday)}</td>
                    <td style={{ padding: 8 }}>{c.email || '—'}</td>
                    <td style={{ padding: 8 }}>{c.city || '—'}</td>
                    {isAdmin && (
                      <td style={{ padding: 8 }}>{creatorNameMap[c.created_by] || (c.created_by || '—')}</td>
                    )}
                    <td style={{ padding: 8 }}>
                      <Link href={`/customers/${c.customer_id}/edit`}><button className="btn">Editar</button></Link>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} style={{ padding: 8 }}>Nenhum cliente encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {errorMsg && <div style={{ marginTop: 12, color: '#9f1239' }}>{errorMsg}</div>}
      </div>
    </Layout>
  );
}