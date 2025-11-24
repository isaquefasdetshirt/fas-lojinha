// pages/payments/new.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import PaymentForm from '../../components/PaymentForm';

export default function NewPayment() {
  const router = useRouter();
  const { customerId } = router.query;
  const [loading, setLoading] = useState(false);

  // novos estados mínimos para fornecer customers filtrados ao PaymentForm
  const [customers, setCustomers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creatorNameMap, setCreatorNameMap] = useState({}); // <-- novo

  useEffect(() => {
    (async () => {
      try {
        const { data: userResp } = await supabase.auth.getUser();
        const user = userResp?.user ?? null;
        const userId = user?.id ?? null;
        setCurrentUserId(userId);

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

        // carrega customers já filtrados: se não admin, somente os que esse usuário criou
        await loadCustomers(user, adminFlag);
      } catch (err) {
        console.error('[new.init] erro', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCustomers(userParam = null, adminFlagParam = null) {
    try {
      let user = userParam;
      if (!user) {
        const { data: userResp } = await supabase.auth.getUser();
        user = userResp?.user ?? null;
      }
      let adminFlag = adminFlagParam;
      if (adminFlag === undefined || adminFlag === null) adminFlag = isAdmin;

      let q = supabase.from('customers').select('customer_id, customer_name, created_by').order('customer_name');
      if (!adminFlag) {
        if (user?.id) q = q.eq('created_by', user.id);
        else {
          setCustomers([]);
          setCreatorNameMap({});
          return;
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      setCustomers(data || []);

      // populate creator name map apenas com os created_by presentes nesta lista (mínimo de requisições)
      populateCreatorNameMap(data || []);
    } catch (err) {
      console.error('[loadCustomers]', err);
      setCustomers([]);
      setCreatorNameMap({});
    }
  }

  // novo: cria um mapa { creatorId: full_name } consultando v_app_users e fallback profiles
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
        if (vusers) vusers.forEach(u => { nameMap[u.id] = u.full_name || u.id; });
      } catch (e) {
        console.warn('[populateCreatorNameMap] v_app_users falhou', e);
      }

      // fallback para profiles se não encontrou todos
      const missing = uniq.filter(id => !nameMap[id]);
      if (missing.length > 0) {
        try {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', missing);
          if (profiles) profiles.forEach(p => { nameMap[p.id] = p.full_name || p.id; });
        } catch (e) {
          console.warn('[populateCreatorNameMap] profiles falhou', e);
        }
      }

      setCreatorNameMap(nameMap);
    } catch (err) {
      console.error('[populateCreatorNameMap] erro', err);
      setCreatorNameMap({});
    }
  }

  async function handleSave(form) {
    setLoading(true);
    try {
      const userRes = await supabase.auth.getUser();
      const user = userRes?.data?.user ?? null;
      const userId = user?.id || null;
      if (!userId) {
        alert('Você precisa estar logado para registrar pagamentos.');
        setLoading(false);
        return;
      }

      // Verificação extra: se não for admin, confirme que o customer selecionado pertence a esse usuário
      if (!isAdmin) {
        try {
          const { data: custCheck, error: errCheck } = await supabase
            .from('customers')
            .select('customer_id')
            .eq('customer_id', form.customer_id)
            .eq('created_by', userId)
            .limit(1);
          if (errCheck) throw errCheck;
          if (!custCheck || custCheck.length === 0) {
            alert('Você só pode registrar pagamentos para clientes que você mesmo cadastrou.');
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('[handleSave] verificação customer pertenca falhou', err);
          alert('Erro ao validar cliente selecionado: ' + (err.message || err));
          setLoading(false);
          return;
        }
      }

      const payload = {
        customer_id: form.customer_id,
        amount: parseFloat(form.amount) || 0,
        date: form.date || new Date().toISOString(),
        method: form.method || null,
        notes: form.notes || null,
        created_by: userId
      };

      const { data, error } = await supabase.from('payments').insert([payload]).select().single();
      if (error) throw error;

      router.push('/payments?customerId=' + form.customer_id);
    } catch (err) {
      console.error('Erro ao salvar pagamento:', err);
      alert('Erro ao salvar pagamento: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

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

      <h1>Novo Pagamento</h1>
      <PaymentForm
        onSave={handleSave}
        loading={loading}
        onCancel={() => router.push('/payments')}
        initialCustomerId={customerId}
        // novas props opcionais:
        customers={customers}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        creatorNameMap={creatorNameMap} // <-- novo: passa o mapa para o form
      />
    </div>
  );
}