// pages/reset-password.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient'; // caminho para /lib/supabaseClient.js

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

function extractAccessTokenFromUrl() {
  if (typeof window === 'undefined') return null;
  try {
    const hash = window.location.hash || '';
    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      return params.get('access_token');
    }
    const search = window.location.search || '';
    if (search.includes('access_token=')) {
      const params = new URLSearchParams(search);
      return params.get('access_token');
    }
  } catch (e) {
    console.warn('[reset] erro ao extrair token da URL', e);
  }
  return null;
}

async function updatePasswordWithToken(token, newPassword) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password: newPassword })
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json && (json.message || JSON.stringify(json))) || res.statusText || 'Erro desconhecido';
    throw new Error(msg);
  }
  return json;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [processing, setProcessing] = useState(true);
  const [readyToUpdate, setReadyToUpdate] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState(null);
  const [usingDirectTokenFlow, setUsingDirectTokenFlow] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // 1) Se disponível, tenta usar getSessionFromUrl (supabase-js v2)
        if (supabase?.auth && typeof supabase.auth.getSessionFromUrl === 'function') {
          try {
            await supabase.auth.getSessionFromUrl({ storeSession: true });
          } catch (e) {
            console.warn('[reset] getSessionFromUrl falhou:', e);
          }
        }

        // 2) Verifica se já existe sessão ativa (isso cobre o caso do verify endpoint que criou a sessão)
        try {
          if (supabase?.auth && typeof supabase.auth.getSession === 'function') {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session ?? null;
            if (session) {
              if (mounted) {
                setReadyToUpdate(true);
                setProcessing(false);
              }
              return;
            }
          }
        } catch (e) {
          console.warn('[reset] erro ao checar sessão:', e);
        }

        // 3) Fallback: extrai token manualmente da URL (fragment ou query)
        const token = extractAccessTokenFromUrl();
        if (token) {
          if (mounted) {
            setRecoveryToken(token);
            setUsingDirectTokenFlow(true);
            setReadyToUpdate(true);
          }
        } else {
          if (mounted) setErrorMsg('Não foi possível restaurar a sessão pelo link. Solicite um novo e-mail de redefinição de senha.');
        }
      } catch (e) {
        console.error('[reset] exceção ao processar link:', e);
        if (mounted) setErrorMsg('Erro ao processar link de recuperação.');
      } finally {
        if (mounted) setProcessing(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setErrorMsg('');
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);

    try {
      // Se há suporte a updateUser via client e não estamos forçando token flow
      if (supabase?.auth && typeof supabase.auth.updateUser === 'function' && !usingDirectTokenFlow) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        try { await supabase.auth.signOut(); } catch (_) {}
        alert('Senha atualizada com sucesso. Faça login com a nova senha.');
        router.push('/login');
        return;
      }

      // Fallback: usar token extraído da URL e chamar a API /auth/v1/user
      const token = recoveryToken || extractAccessTokenFromUrl();
      if (!token) {
        throw new Error('Token de recuperação ausente. Solicite um novo e-mail de redefinição.');
      }

      await updatePasswordWithToken(token, newPassword);

      try { await supabase.auth.signOut(); } catch (_) {}

      alert('Senha atualizada com sucesso. Faça login com a nova senha.');
      router.push('/login');
    } catch (err) {
      console.error('[reset] erro ao salvar senha:', err);
      setErrorMsg('Erro ao atualizar senha: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '40px auto' }}>
      <h2>Redefinir senha</h2>

      {processing ? (
        <div>Processando link...</div>
      ) : (
        <>
          {errorMsg ? <div style={{ color: 'red', marginBottom: 12 }}>{errorMsg}</div> : null}
          {readyToUpdate ? (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 6 }}>Nova senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
                />
              </div>
              <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar nova senha'}</button>
            </form>
          ) : (
            <div>
              Não foi possível restaurar a sessão pelo link. Solicite um novo e-mail de redefinição de senha.
            </div>
          )}
        </>
      )}
    </div>
  );
}