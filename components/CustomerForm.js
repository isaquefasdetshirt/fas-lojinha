// components/CustomerForm.js
import { useState } from 'react';

function isoToDisplay(iso) {
  if (!iso) return '';
  const isoMatch = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;
  }
  const ddmmMatch = iso.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmMatch) return iso.slice(0,10);
  return '';
}

function displayToISO(display) {
  const m = (display || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function isValidISODate(iso) {
  if (!iso) return false;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  const daysInMonth = new Date(y, mo, 0).getDate();
  if (d < 1 || d > daysInMonth) return false;
  return true;
}

export default function CustomerForm({ initial = {}, onSave, loading, onCancel }) {
  const [form, setForm] = useState({
    customer_name: initial.customer_name || '',
    phone: initial.phone || '',
    birthday: isoToDisplay(initial.birthday) || '',
    email: initial.email || '',
    city: initial.city || '',
  });
  const [error, setError] = useState('');

  function formatPhoneFromDigits(digits) {
    const d = digits || '';
    const part1 = d.slice(0, 2);
    const rest = d.slice(2);
    if (rest.length > 5) {
      const part2 = rest.slice(0, 5);
      const part3 = rest.slice(5, 9);
      return `(${part1}) ${part2}${part3 ? '-' + part3 : ''}`;
    } else {
      const part2 = rest.slice(0, 4);
      const part3 = rest.slice(4, 8);
      return `(${part1}) ${part2}${part3 ? '-' + part3 : ''}`;
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;

    if (name === 'phone') {
      const onlyDigits = (value || '').replace(/\D/g, '').slice(0, 11);
      const formatted = onlyDigits ? formatPhoneFromDigits(onlyDigits) : '';
      setForm({ ...form, [name]: formatted });
      return;
    }

    if (name === 'birthday') {
      const digits = (value || '').replace(/\D/g, '').slice(0, 8);
      let display = '';
      if (digits.length <= 2) {
        display = digits;
      } else if (digits.length <= 4) {
        display = `${digits.slice(0,2)}/${digits.slice(2)}`;
      } else {
        display = `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4,8)}`;
      }
      setForm({ ...form, birthday: display });
      return;
    }

    setForm({ ...form, [name]: value });
  }

  function validate() {
    if (!form.customer_name.trim()) return 'Nome é obrigatório';
    const digits = (form.phone || '').replace(/\D/g, '');
    if (!digits) return 'Telefone é obrigatório';
    if (digits.length < 10) return 'Telefone inválido: mínimo 10 dígitos (DDD + número)';
    if (digits.length > 11) return 'Telefone inválido: máximo 11 dígitos';
    if (!form.birthday) return 'Data de aniversário é obrigatória';
    const iso = displayToISO(form.birthday);
    if (!iso) return 'Data de aniversário inválida. Digite dd/mm/aaaa';
    if (!isValidISODate(iso)) return 'Data de aniversário inválida (dia/mês/ano incorretos)';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    const isoBirthday = displayToISO(form.birthday);
    await onSave({
      ...form,
      birthday: isoBirthday
    });
  }

  return (
    <div className="card">
      <form onSubmit={handleSubmit}>
        {error && <div style={{ color: '#9f1239', marginBottom: 10 }}>{error}</div>}

        <label>Nome completo *</label>
        <input
          name="customer_name"
          value={form.customer_name}
          onChange={handleChange}
          className="input"
          placeholder="Nome completo"
        />

        <label>Telefone *</label>
        <input
          name="phone"
          value={form.phone}
          onChange={handleChange}
          className="input"
          placeholder="(00) 00000-0000"
          maxLength={16}
        />

        <label>Data de aniversário *</label>
        <input
          name="birthday"
          value={form.birthday}
          onChange={handleChange}
          className="input"
          placeholder="dd/mm/aaaa"
          maxLength={10}
        />

        <label>Email</label>
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          className="input"
          placeholder="email@exemplo.com"
        />

        <label>Cidade</label>
        <input
          name="city"
          value={form.city}
          onChange={handleChange}
          className="input"
          placeholder="Cidade"
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}