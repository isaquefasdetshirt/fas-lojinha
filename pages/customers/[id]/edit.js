// pages/customers/[id]/edit.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabaseClient';
import CustomerForm from '../../../components/CustomerForm';
import Layout from '../../../components/Layout';

export default function EditCustomer() {
  const router = useRouter();
  const { id } = router.query;
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!id) return;
    loadCustomer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadCustomer() {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('customer_id, customer_name, phone, birthday, email, city, created_by')
        .eq('customer_id', id)
        .maybeSingle();

      if (error) throw error;
      setCustomer(data || null);
    } catch (err) {
      console.error('Erro ao carregar cliente:', err);
      setMsg('Erro ao carregar cliente: ' + (err.message || err));
    }
  }

  async function handleSave(form) {
    setLoading(true);
    setMsg('');
    try {
      const { data, error } = await supabase
        .from('customers')
        .update({
          customer_name: form.customer_name,
          phone: form.phone || null,
          birthday: form.birthday || null,
          email: form.email || null,
          city: form.city || null
        })
        .eq('customer_id', id)
        .select()
        .maybeSingle();

      if (error) throw error;

      router.push('/customers');
    } catch (err) {
      console.error('Erro ao atualizar cliente:', err);
      setMsg('Erro ao atualizar cliente: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  if (!customer) return (
    <Layout pageTitle="Editar Cliente">
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>Carregando...</div>
    </Layout>
  );

  return (
    <Layout pageTitle="Editar Cliente">
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
        <h1>Editar Cliente</h1>
        <CustomerForm initial={customer} onSave={handleSave} loading={loading} onCancel={() => router.push('/customers')} />
        {msg && <div style={{ marginTop: 12, color: '#9f1239' }}>{msg}</div>}
      </div>
    </Layout>
  );
}