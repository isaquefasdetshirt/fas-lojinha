// pages/login.js
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg('Erro: ' + error.message);
    } else {
      router.push('/dashboard');
    }
    setLoading(false);
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!email) return setMsg('Informe o e‑mail para redefinir a senha.');
    setLoading(true);
    setMsg('');
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setMsg('Link de redefinição enviado. Abra o link NA MESMA aba ou copie/cole o link no navegador.');
    } catch (err) {
      setMsg('Erro ao enviar: ' + (err.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout pageTitle="Entrar">
      <div style={{ maxWidth: 420, margin: '24px auto' }}>
        <div className="card">
          <h2 style={{ margin: '0 0 12px 0' }}>Entrar na sua conta</h2>

          <form onSubmit={handleLogin}>
            <label className="label">E‑mail</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            <label className="label">Senha</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <button
                className="btn ghost"
                onClick={handleResetPassword}
                disabled={loading}
                type="button"
              >
                {loading ? 'Enviando...' : 'Esqueci a senha'}
              </button>
            </div>
          </form>

          {msg && <div style={{ marginTop: 12, color: '#9f1239' }}>{msg}</div>}

          <div style={{ marginTop: 14, color: 'var(--muted)' }}>
            Novo por aqui? <a href="/request-access" className="linkish">Criar conta</a>
          </div>
        </div>
      </div>

      <style jsx>{`
        .card {
          padding: 18px;
          border-radius: 12px;
          background: var(--card-bg);
          border: 1px solid var(--border);
          box-shadow: var(--shadow);
        }
        .label {
          display:block;
          margin-top: 10px;
          margin-bottom: 6px;
          font-weight:600;
          color: #374151;
        }
        .input {
          width:100%;
          padding:10px 12px;
          border-radius:8px;
          border:1px solid var(--border);
          box-sizing: border-box;
          outline: none;
        }
        .input:focus { box-shadow: 0 6px 18px rgba(79,70,229,0.06); border-color: rgba(124,58,237,0.18); }

        .btn { border-radius:10px; padding:8px 12px; font-weight:700; cursor:pointer; border:none; }
        .btn.primary { background: linear-gradient(90deg,var(--brand-mid),var(--brand-accent)); color:white; }
        .btn.ghost { background: transparent; border:1px solid var(--border); color: var(--muted); }

        .linkish { color: #4c1d95; font-weight:700; text-decoration: none; }
        .linkish:hover { text-decoration: underline; }

        @media (max-width: 520px) {
          .card { padding: 14px; }
        }
      `}</style>
    </Layout>
  );
}