// pages/index.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';
import Layout from '../components/Layout';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  // Redireciona se já estiver logado
  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  const signInPassword = async (e) => {
    e.preventDefault();
    setMsg('Entrando...');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(error.message || 'Erro ao entrar');
      return;
    }
    const user = data.user;
    if (!user?.email_confirmed_at) {
      setMsg('Você precisa confirmar seu e-mail antes de acessar. Verifique sua caixa de entrada.');
      return;
    }

    try {
      const { data: rows, error: qerr } = await supabase.from('v_app_users').select('*').eq('id', user.id).single();
      if (qerr) { 
        setMsg('Erro ao verificar usuário: ' + qerr.message); 
        return; 
      }
      if (!rows.is_approved && rows.role !== 'admin') {
        setMsg('Seu cadastro não foi aprovado. Aguarde um administrador.');
        return;
      }
    } catch(e) {}

    setMsg('Login efetuado. Redirecionando...');
    router.replace('/dashboard');
  };

  const forgotPassword = async () => {
    if (!email) { setMsg('Digite o email primeiro para receber o reset.'); return; }
    setMsg('Enviando instruções de recuperação para o email...');
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) setMsg(error.message);
    else setMsg('Verifique seu email para redefinir a senha.');
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <Layout pageTitle="Entrar">
      <div style={{ maxWidth: 420, margin: '24px auto' }}>
        <div className="card">
          <h2 style={{ margin: '0 0 12px 0' }}>Entrar</h2>

          <form onSubmit={signInPassword}>
            <label className="label">E‑mail</label>
            <input className="input" value={email} onChange={e => setEmail(e.target.value)} required />

            <label className="label">Senha</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />

            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button className="btn primary" type="submit">Entrar</button>
              <button className="btn ghost" type="button" onClick={forgotPassword}>Esqueci a senha</button>
            </div>
          </form>

          <p style={{ color: 'red', marginTop: 12 }}>{msg}</p>

          <div style={{ marginTop: 14, color: 'var(--muted)' }}>
            Novo por aqui? <Link href="/request-access" className="linkish">Criar conta</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}