// components/ChangePassword.js
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ChangePassword() {
  const [currentPwd, setCurrentPwd] = useState(''); // opcional: nem sempre necessário com supabase.auth.updateUser
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleChange(e) {
    e.preventDefault();
    setMsg('');
    if (!newPwd) return setMsg('Informe a nova senha.');
    if (newPwd !== confirmPwd) return setMsg('Senhas não conferem.');
    // validações extras de força de senha podem ser aplicadas aqui
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      setMsg('Senha alterada com sucesso.');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err) {
      console.error('[ChangePassword] ', err);
      setMsg('Erro ao alterar senha: ' + (err.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleChange} style={{ maxWidth: 420 }}>
      <h3>Alterar senha</h3>
      {/* currentPwd é opcional — supabase autentica via access_token do usuário logado */}
      <div style={{ marginBottom: 8 }}>
        <label>Nova senha</label><br/>
        <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Confirmar nova senha</label><br/>
        <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required />
      </div>
      <div>
        <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Alterar senha'}</button>
      </div>
      {msg && <div style={{ marginTop: 8, color: 'crimson' }}>{msg}</div>}
    </form>
  );
}