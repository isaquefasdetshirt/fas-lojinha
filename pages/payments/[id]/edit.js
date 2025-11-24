// pages/payments/[id]/edit.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabaseClient';
import PaymentForm from '../../../components/PaymentForm';
import { useAuth } from '../../../hooks/useAuth'; // <-- novo

export default function EditPayment() {
  const router = useRouter();
  const { id } = router.query;
  const { user, isAdmin } = useAuth(); // <-- novo
  const [payment, setPayment] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [creatorNameMap, setCreatorNameMap] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadPayment();
    loadCustomers(); // <-- novo
  }, [id]);

  async function loadPayment() {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('payment_id', id)
        .maybeSingle();
      if (error) throw error;
      setPayment(data || null);
    } catch (err) {
      console.error('Erro ao carregar pagamento:', err);
      alert('Erro ao carregar pagamento: ' + (err.message || err));
    }
  }

  async function loadCustomers() {
    try {
      let q = supabase.from('customers').select('customer_id, customer_name, created_by').order('customer_name');
      if (!isAdmin && user?.id) {
        q = q.eq('created_by', user.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      setCustomers(data || []);

      await populateCreatorNameMap(data || []);
    } catch (err) {
      console.error('[loadCustomers]', err);
      setCustomers([]);
      setCreatorNameMap({});
    }
  }

  async function populateCreatorNameMap(customersList) {
    try {
      const uniq = [...new Set((customersList || []).map(c => c.created_by).filter(Boolean))];
      if (uniq.length === 0) {
        setCreatorNameMap({});
        return;
      }

      let nameMap = {};
      try {
        const { data: vusers } = await supabase.from('v_app_users').select('id, full_name').in('id', uniq);
        if (vusers) vusers.forEach(u => { nameMap[String(u.id)] = u.full_name || u.id; });
      } catch (e) {
        console.warn('[populateCreatorNameMap] v_app_users falhou', e);
      }

      const missing = uniq.filter(id => !nameMap[String(id)]);
      if (missing.length > 0) {
        try {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', missing);
          if (profiles) profiles.forEach(p => { nameMap[String(p.id)] = p.full_name || p.id; });
        } catch (e) {
          console.warn('[populateCreatorNameMap] profiles falhou', e);
        }
      }

      if (user?.id && !nameMap[String(user.id)]) nameMap[String(user.id)] = 'Eu';
      setCreatorNameMap(nameMap);
    } catch (err) {
      console.error('[populateCreatorNameMap] erro', err);
      setCreatorNameMap({});
    }
  }

  async function handleSave(form) {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('payments')
        .update({
          customer_id: form.customer_id,
          amount: parseFloat(form.amount) || 0,
          date: form.date,
          method: form.method || null,
          notes: form.notes || null
        })
        .eq('payment_id', id);
      if (error) throw error;

      alert('Pagamento atualizado com sucesso!');
      router.push('/payments?customerId=' + form.customer_id);
    } catch (err) {
      console.error('Erro ao atualizar pagamento:', err);
      alert('Erro ao atualizar pagamento: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  if (!payment) return <div>Carregando...</div>;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
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
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; box-shadow: var(--shadow); }
        button { background: linear-gradient(90deg, var(--brand-mid), var(--brand-accent)); color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-weight:700; }
        button.small { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 6px 8px; border-radius: 8px; }
        select, input[type="date"], input[type="text"], textarea { border: 1px solid var(--border); padding: 8px; border-radius: 8px; min-width: 160px; }
      `}</style>

      <h1>Editar Pagamento</h1>
      <PaymentForm
        initial={payment}
        onSave={handleSave}
        loading={loading}
        onCancel={() => router.push('/payments')}
        customers={customers} // <-- novo
        creatorNameMap={creatorNameMap} // <-- novo
        isAdmin={isAdmin} // <-- novo
        currentUserId={user?.id} // <-- novo
      />
    </div>
  );
}