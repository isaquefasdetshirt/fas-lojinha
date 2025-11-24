// pages/admin/users.js
import { useEffect, useState, useMemo } from 'react';
import AdminRoute from '../../components/AdminRoute';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';

export default function AdminUsersPage() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();
  }, [isAdmin]);

  async function fetchUsers() {
    setLoading(true);
    setMsg('');
    try {
      const { data, error } = await supabase
        .from('v_app_users')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Erro ao buscar usuarios', err);
      setMsg('Erro ao buscar usuários: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  // phone helpers (mesma lógica do request-access)
  function onlyDigits(value = '') {
    return value.replace(/\D/g, '');
  }

  function formatPhoneInput(value = '') {
    const nums = onlyDigits(value).slice(0, 11); // máximo 11 dígitos
    if (nums.length === 0) return '';
    if (nums.length <= 2) return `(${nums}`;
    if (nums.length <= 6) return `(${nums.slice(0,2)}) ${nums.slice(2)}`;
    const dd = nums.slice(0,2);
    const middle = nums.slice(2, nums.length - 4);
    const last4 = nums.slice(-4);
    return `(${dd}) ${middle}-${last4}`; // sem espaços ao redor do "-"
  }

  function isPhoneValid(phone = '') {
    return /^\(\d{2}\) \d{4,5}-\d{4}$/.test(phone);
  }

  async function toggleApprove(u) {
    if (!confirm(`${u.full_name || u.email}\nConfirmar alteração de aprovação?`)) return;
    const newVal = !u.is_approved;
    setMsg('Atualizando status...');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: newVal })
        .eq('id', u.id);
      if (error) throw error;
      setMsg('Status atualizado.');
      await fetchUsers();
    } catch (err) {
      console.error('Erro ao aprovar/desaprovar', err);
      setMsg('Erro ao atualizar: ' + (err.message || err));
    }
  }

  async function toggleActive(u) {
    if (!confirm(`${u.full_name || u.email}\nConfirmar alteração de ativo/inativo?`)) return;
    const newVal = !u.is_active;
    setMsg('Atualizando ativo/inativo...');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: newVal })
        .eq('id', u.id);
      if (error) throw error;
      setMsg('Status de ativação atualizado.');
      await fetchUsers();
    } catch (err) {
      console.error('Erro ao ativar/desativar', err);
      setMsg('Erro ao atualizar: ' + (err.message || err));
    }
  }

  async function sendResetEmail(u) {
    if (!u?.email) {
      setMsg('Usuário não tem email registrado');
      return;
    }
    if (!confirm(`Enviar email de recuperação para: ${u.email}?`)) return;
    setMsg('Enviando email de recuperação...');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(u.email);
      if (error) throw error;
      setMsg('Email de redefinição enviado para ' + u.email);
    } catch (err) {
      console.error('Erro ao enviar reset email', err);
      setMsg('Erro ao enviar email: ' + (err.message || err));
    }
  }

  function openEdit(u) {
    // garante que phone esteja formatado ao abrir
    setEditingUser({
      ...u,
      phone: u.phone ? formatPhoneInput(u.phone) : ''
    });
  }

  function closeEdit() {
    setEditingUser(null);
    setMsg('');
  }

  function handleEditChange(key, value) {
    if (!editingUser) return;
    let next = value;
    if (key === 'phone') {
      next = formatPhoneInput(value);
    }
    setEditingUser({ ...editingUser, [key]: next });
  }

  async function saveEdit() {
    if (!editingUser) return;

    // validações mínimas
    if (!editingUser.full_name || !editingUser.full_name.trim()) {
      setMsg('Nome é obrigatório.');
      return;
    }

    const usernameVal = (editingUser.username || '').trim();
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(usernameVal)) {
      setMsg('Username inválido. Use ao menos 3 caracteres: letras, números, ._-');
      return;
    }

    if (editingUser.phone && !isPhoneValid(editingUser.phone)) {
      setMsg('Telefone inválido. Use (xx) xxxx-xxxx ou (xx) xxxxx-xxxx.');
      return;
    }

    setMsg('Verificando username e salvando alterações...');

    try {
      // checar unicidade do username (exceto o próprio registro)
      const { data: clash, error: clashErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', usernameVal)
        .neq('id', editingUser.id)
        .limit(1)
        .maybeSingle();

      if (clashErr) {
        console.warn('erro checando username', clashErr);
      }
      if (clash) {
        setMsg('Username já está em uso por outro usuário. Escolha outro.');
        return;
      }

      // preparar payload (inclui username agora)
      const payload = {
        full_name: editingUser.full_name ?? null,
        username: usernameVal || null,
        phone: editingUser.phone ?? null,
        birthday: editingUser.birthday ?? null,
        notes: editingUser.notes ?? null,
      };

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', editingUser.id);

      if (error) throw error;

      setMsg('Salvo com sucesso.');
      closeEdit();
      await fetchUsers();
    } catch (err) {
      console.error('Erro ao salvar edição', err);
      setMsg('Erro ao salvar: ' + (err.message || JSON.stringify(err)));
    }
  }

  // client-side filtering
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q)
    );
  }, [users, query]);

  if (!isAdmin) return <AdminRoute><div>Protegido</div></AdminRoute>;

  return (
    <AdminRoute>
      <div style={{ maxWidth: 1100 }}>
        <h1>Admin — Usuários</h1>

        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Buscar por nome, email ou username"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <button className="btn primary" onClick={fetchUsers} disabled={loading}>
            {loading ? 'Atualizando...' : 'Atualizar lista'}
          </button>
          <div style={{ marginLeft: 'auto', color: 'green' }}>{msg}</div>
        </div>

        <div className="card" style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: 12 }}>Carregando...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e6e6e6' }}>
                  <th style={{ padding: 8 }}>ID</th>
                  <th style={{ padding: 8 }}>Nome</th>
                  <th style={{ padding: 8 }}>Email</th>
                  <th style={{ padding: 8 }}>Username</th>
                  <th style={{ padding: 8 }}>Telefone</th>
                  <th style={{ padding: 8 }}>Aniver</th>
                  <th style={{ padding: 8 }}>Aprovado</th>
                  <th style={{ padding: 8 }}>Ativo</th>
                  <th style={{ padding: 8 }}>Role</th>
                  <th style={{ padding: 8 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} style={{ borderTop: '1px solid #f3f3f3' }}>
                    <td style={{ padding: 8, verticalAlign: 'top', fontSize: 12 }}>{u.id}</td>
                    <td style={{ padding: 8 }}>{u.full_name ?? '-'}</td>
                    <td style={{ padding: 8 }}>{u.email ?? '-'}</td>
                    <td style={{ padding: 8 }}>{u.username ?? '-'}</td>
                    <td style={{ padding: 8 }}>{u.phone ?? '-'}</td>
                    <td style={{ padding: 8 }}>{u.birthday ?? '-'}</td>
                    <td style={{ padding: 8 }}>
                      <span className="badge" style={{ background: u.is_approved ? '#dcfce7' : '#fff1f2', borderColor: u.is_approved ? '#bbf7d0' : '#fecaca', color: u.is_approved ? '#065f46' : '#7f1d1d' }}>
                        {u.is_approved ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>
                      <span className="badge" style={{ background: u.is_active ? '#eef2ff' : '#fff7ed', borderColor: u.is_active ? '#c7d2fe' : '#ffd8a8', color: u.is_active ? '#3730a3' : '#92400e' }}>
                        {u.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{u.role ?? '-'}</td>
                    <td style={{ padding: 8 }}>
                      <button className="btn" onClick={() => toggleApprove(u)}>
                        {u.is_approved ? 'Desaprovar' : 'Aprovar'}
                      </button>
                      <button className="btn" style={{ marginLeft: 6 }} onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button className="btn" style={{ marginLeft: 6 }} onClick={() => sendResetEmail(u)}>
                        Enviar reset
                      </button>
                      <button className="btn" style={{ marginLeft: 6 }} onClick={() => openEdit(u)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {editingUser && (
          <div
            style={{
              marginTop: 20,
              padding: 12,
              border: '1px solid #e6e6e6',
              borderRadius: 8,
              background: '#fff'
            }}
          >
            <h3>Editar usuário: {editingUser.full_name || editingUser.email || editingUser.id}</h3>
            <p style={{ color: '#666', marginTop: -8, marginBottom: 12 }}>
              ID: {editingUser.id} | Email: {editingUser.email || '-'}
            </p>

            <label>Nome</label>
            <input className="input" value={editingUser.full_name ?? ''} onChange={(e) => handleEditChange('full_name', e.target.value)} />

            <label>Username</label>
            <input
              className="input"
              value={editingUser.username ?? ''}
              onChange={(e) => handleEditChange('username', e.target.value)}
              placeholder="username (3+ caracteres, letras, números, ._-)"
            />

            <label>Telefone</label>
            <input className="input" value={editingUser.phone ?? ''} onChange={(e) => handleEditChange('phone', e.target.value)} placeholder="(xx) xxxx-xxxx ou (xx) xxxxx-xxxx" />

            <label>Aniversário</label>
            <input className="input" type="date" value={editingUser.birthday ?? ''} onChange={(e) => handleEditChange('birthday', e.target.value)} />

            <label>Observações</label>
            <textarea className="input" rows={3} value={editingUser.notes ?? ''} onChange={(e) => handleEditChange('notes', e.target.value)} />

            <div style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={saveEdit}>Salvar</button>
              <button className="btn" onClick={closeEdit} style={{ marginLeft: 8 }}>Cancelar</button>
            </div>
            <div style={{ marginTop: 8, color: 'green' }}>{msg}</div>
          </div>
        )}
      </div>
    </AdminRoute>
  );
}