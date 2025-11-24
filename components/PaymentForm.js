// components/PaymentForm.js
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';

export default function PaymentForm({
  initial = {},
  onSave,
  loading,
  onCancel,
  initialCustomerId,
  customers: customersProp = null,
  isAdmin: isAdminProp = null,
  currentUserId: currentUserIdProp = null,
  creatorNameMap: creatorNameMapProp = {}
}) {
  const { user, isAdmin: isAdminCtx, loading: authLoading } = useAuth();
  const isAdmin = isAdminProp ?? isAdminCtx;
  const currentUserId = currentUserIdProp ?? user?.id ?? null;
  const creatorNameMap = creatorNameMapProp ?? {};

  const [form, setForm] = useState({
    customer_id: initial.customer_id || initialCustomerId || '',
    amount: initial.amount || '',
    date: initial.date ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    method: initial.method || '',
    notes: initial.notes || ''
  });
  const [customers, setCustomers] = useState(Array.isArray(customersProp) ? customersProp : []);
  const [error, setError] = useState('');
  const [fetchedCreatorNames, setFetchedCreatorNames] = useState({});
  const didLoadCustomersRef = useRef(false); // evita fetchs duplicados

  useEffect(() => {
    // se o parent passou customers, use-o
    if (Array.isArray(customersProp)) {
      setCustomers(customersProp);
      didLoadCustomersRef.current = true;
      return;
    }
    // se já carregamos manualmente, não repetir
    if (didLoadCustomersRef.current) return;
    // aguarda auth ser re-hidratada antes de carregar
    if (authLoading) return;
    // carrega customers apenas quando auth inicializada
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customersProp, authLoading, isAdmin, currentUserId]);

  async function loadCustomers() {
    try {
      didLoadCustomersRef.current = true;
      let q = supabase.from('customers').select('customer_id, customer_name, created_by').order('customer_name');
      // se não for admin, filtra por created_by
      if (!isAdmin && currentUserId) q = q.eq('created_by', currentUserId);
      const { data, error } = await q;
      if (error) {
        console.error('[PaymentForm] loadCustomers error', error);
        setCustomers([]);
        return;
      }
      setCustomers(data || []);
    } catch (err) {
      console.error('[PaymentForm] loadCustomers unexpected error', err);
      setCustomers([]);
    }
  }

  // busca nomes faltantes (v_app_users / profiles) apenas para ids que aparecem
  useEffect(() => {
    const ids = [...new Set((customers || []).map(c => c.created_by).filter(Boolean).map(id => String(id)))];
    const missing = ids.filter(id => !(id in creatorNameMap) && !(id in fetchedCreatorNames));
    if (missing.length === 0) return;

    (async () => {
      try {
        const nameMap = {};
        const { data: vusers } = await supabase.from('v_app_users').select('id, full_name').in('id', missing);
        if (vusers) vusers.forEach(u => nameMap[String(u.id)] = u.full_name || u.id);

        const stillMissing = missing.filter(id => !nameMap[id]);
        if (stillMissing.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', stillMissing);
          if (profiles) profiles.forEach(p => nameMap[String(p.id)] = p.full_name || p.id);
        }

        setFetchedCreatorNames(prev => ({ ...prev, ...nameMap }));
        console.log('[PaymentForm] fetched creator names for missing ids', Object.keys(nameMap));
      } catch (e) {
        console.warn('[PaymentForm] erro ao buscar nomes de criadores faltantes', e);
      }
    })();
  }, [customers, creatorNameMap, fetchedCreatorNames]);

  useEffect(() => {
    // logs de diagnóstico
    console.log('[PaymentForm] customers count:', customers.length);
    console.log('[PaymentForm] sample customers (first 5):', customers.slice(0, 5));
    console.log('[PaymentForm] creatorNameMap keys:', Object.keys(creatorNameMap).slice(0, 10));
    console.log('[PaymentForm] fetchedCreatorNames keys:', Object.keys(fetchedCreatorNames).slice(0, 10));
    console.log('[PaymentForm] isAdmin, currentUserId, authLoading:', isAdmin, currentUserId, authLoading);
  }, [customers, creatorNameMap, fetchedCreatorNames, isAdmin, currentUserId, authLoading]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function validate() {
    if (!form.customer_id) return 'Cliente é obrigatório';
    if (!form.amount || isNaN(parseFloat(form.amount))) return 'Valor inválido';
    if (parseFloat(form.amount) <= 0) return 'Valor deve ser maior que zero';
    if (!form.date) return 'Data é obrigatória';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    await onSave({ ...form });
  }

  function getCreatorLabel(c) {
    const createdBy = c?.created_by;
    if (!createdBy) return null;
    const cid = String(createdBy);
    const uid = currentUserId ? String(currentUserId) : '';
    if (uid && cid === uid) return ' (me)';
    return ` — ${creatorNameMap[cid] || fetchedCreatorNames[cid] || cid}`;
  }

  return (
    <div className="card">
      <style>{`
        :root {
          --brand-left: #FDE9B8;
          --brand-mid: #F7C6D9;
          --brand-accent: #E77AAE;
          --muted: #6b7280;
          --card-bg: #ffffff;
          --border: #e9e6ea;
          --shadow: 0 8px 24px rgba(15,23,42,0.06);
          --primary: #0070f3;
        }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 16px; box-shadow: var(--shadow); }
        label { display:block; font-weight:600; margin-bottom:6px; color: #111827; }
        select, input[type="date"], input[type="text"], input[type="number"], textarea {
          border: 1px solid var(--border);
          padding: 8px;
          border-radius: 8px;
          width: 100%;
          box-sizing: border-box;
        }
        .row { margin-bottom: 12px; }
        .row-inline { display:flex; gap:8px; align-items:center; }
        .btn { background: linear-gradient(90deg, var(--brand-mid), var(--brand-accent)); color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight:700; }
        .btn.secondary { background: #f3f4f6; color: #111827; border: 1px solid #e5e7eb; }
        .small-btn { padding: 8px 10px; border-radius: 6px; }
        .error { color: #b91c1c; margin-bottom: 10px; }
      `}</style>

      <form onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}

        <div className="row">
          <label>Cliente *</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select name="customer_id" value={form.customer_id} onChange={handleChange} required>
              <option value="">-- selecione --</option>
              {customers.map(c => {
                let label = c.customer_name || '—';
                if (isAdmin && c.created_by) {
                  const suffix = getCreatorLabel(c);
                  if (suffix) label += suffix;
                }
                return <option key={c.customer_id} value={c.customer_id}>{label}</option>;
              })}
            </select>
            <Link href={{ pathname: '/customers', query: { returnTo: typeof window !== 'undefined' ? window.location.pathname : '' } }}>
              <button type="button" className="btn secondary small-btn">Cadastrar cliente</button>
            </Link>
          </div>
        </div>

        <div className="row">
          <label>Valor *</label>
          <input name="amount" type="number" step="0.01" value={form.amount} onChange={handleChange} />
        </div>

        <div className="row">
          <label>Data *</label>
          <input name="date" type="date" value={form.date} onChange={handleChange} />
        </div>

        <div className="row">
          <label>Método de pagamento</label>
          <select name="method" value={form.method} onChange={handleChange}>
            <option value="">-- selecione --</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="cartão débito">Cartão Débito</option>
            <option value="cartão crédito">Cartão Crédito</option>
            <option value="PIX">PIX</option>
            <option value="boleto">Boleto</option>
          </select>
        </div>

        <div className="row">
          <label>Observações</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} style={{ minHeight: 60 }} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={loading} className="btn">
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" onClick={onCancel} className="btn secondary">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}