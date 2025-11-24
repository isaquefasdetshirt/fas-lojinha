// pages/customers/new.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import CustomerForm from '../../components/CustomerForm';
import Layout from '../../components/Layout';

export default function NewCustomer() {
  const router = useRouter();
  const { returnTo } = router.query;
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSave(form) {
    setLoading(true);
    setMsg('');
    try {
      const userRes = await supabase.auth.getUser();
      const userId = userRes?.data?.user?.id || null;
      if (!userId) {
        setMsg('Você precisa estar logado para cadastrar clientes.');
        setLoading(false);
        return;
      }

      const payload = {
        customer_name: form.customer_name,
        phone: form.phone || null,
        birthday: form.birthday || null,
        email: form.email || null,
        city: form.city || null,
        created_by: userId
      };

      const { data, error } = await supabase.from('customers').insert([payload]).select().single();
      if (error) throw error;

      if (returnTo) {
        router.replace(returnTo);
      } else {
        router.replace('/customers');
      }
    } catch (err) {
      console.error('Erro ao salvar cliente:', err);
      setMsg('Erro ao salvar cliente: ' + (err.message || err));
      setLoading(false);
    }
  }

  return (
    <Layout pageTitle="Cadastrar Cliente">
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
        <h1>Cadastrar Cliente</h1>
        <CustomerForm onSave={handleSave} loading={loading} onCancel={() => router.push('/customers')} />
        {msg && <div style={{ marginTop: 12, color: '#9f1239' }}>{msg}</div>}
      </div>
    </Layout>
  );
}