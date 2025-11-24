// components/SaleForm.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import SaleItemRow from './SaleItemRow';

export default function SaleForm({ initial = {}, onSave, loading, onCancel }) {
  const [form, setForm] = useState({
    customer_id: initial.customer_id || '',
    date: initial.date ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    discount_amount: initial.discount_amount || 0,
    discount_percent: initial.discount_percent || 0,
    notes: initial.notes || '',
    items: initial.items || [{ codigo: '', description: '', qty: 1, unit_price: 0 }],
  });
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState('');
  const [allow3Digits, setAllow3Digits] = useState(false);

  useEffect(() => { loadCustomers(); }, []);

  async function loadCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('customer_id, customer_name')
      .order('customer_name');
    if (error) { console.error(error); return; }
    setCustomers(data || []);
  }

  function handleItemChange(index, newItem) {
    const newItems = [...form.items];
    newItems[index] = newItem;
    setForm({ ...form, items: newItems });
  }

  function handleAddItem() {
    setForm({
      ...form,
      items: [...form.items, { codigo: '', description: '', qty: 1, unit_price: 0 }],
    });
  }

  function handleRemoveItem(index) {
    const newItems = [...form.items];
    newItems.splice(index, 1);
    setForm({ ...form, items: newItems });
  }

  function calculateSubtotal() {
    return form.items.reduce((sum, item) => sum + (item.qty || 0) * (item.unit_price || 0), 0);
  }

  function calculateDiscount() {
    const subtotal = calculateSubtotal();
    if (form.discount_percent > 0) return (subtotal * form.discount_percent) / 100;
    return form.discount_amount || 0;
  }

  function calculateTotal() {
    return calculateSubtotal() - calculateDiscount();
  }

  function getCodeRegex(allow3) {
    const sizes = '(?:P0|PP|M0|G0|GG|G1|G2|G3|XG|U0)';
    if (allow3) return new RegExp(`^[A-Z]{2}\\d{2,3}\\.\\d{2}${sizes}$`);
    return new RegExp(`^[A-Z]{2}\\d{2}\\.\\d{2}${sizes}$`);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const subtotal = calculateSubtotal();
    const discount = calculateDiscount();
    const total = calculateTotal();

    if (!form.customer_id) { setError('Selecione um cliente.'); return; }
    if (form.items.some(i => !i.codigo || !i.description || !i.qty || !i.unit_price)) {
      setError('Preencha todos os campos dos itens.'); return;
    }
    const codeRegex = getCodeRegex(allow3Digits);
    for (const it of form.items) {
      if (!codeRegex.test((it.codigo || '').toUpperCase())) {
        setError('Código inválido em um dos itens. Formato esperado: AA00.11P0 (ou com 3 dígitos se ativado).');
        return;
      }
    }
    if (total < 0) { setError('Desconto não pode ser maior que o subtotal.'); return; }

    setError('');
    await onSave({
      ...form,
      subtotal,
      discount_amount: discount,
      total,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: 12, borderRadius: 8, background: '#fff', border: '1px solid #e9e6ea' }}>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}

      <div style={{ marginBottom: 12 }}>
        <label style={{ marginRight: 8 }}>Permitir 3º dígito antes do ponto: </label>
        <input type="checkbox" checked={allow3Digits} onChange={e => setAllow3Digits(e.target.checked)} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Cliente *</label>
        <select
          value={form.customer_id}
          onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
          required
          style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e9e6ea' }}
        >
          <option value="">-- selecione --</option>
          {customers.map((c) => (
            <option key={c.customer_id} value={c.customer_id}>
              {c.customer_name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Data</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e9e6ea' }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Itens</label>
        {form.items.map((item, index) => (
          <SaleItemRow
            key={index}
            item={item}
            allow3Digits={allow3Digits}
            onChange={(newItem) => handleItemChange(index, newItem)}
            onRemove={() => handleRemoveItem(index)}
          />
        ))}
        <button
          type="button"
          onClick={handleAddItem}
          style={{
            marginTop: 8,
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(90deg,#FDE9B8,#F7C6D9)',
            cursor: 'pointer'
          }}
        >
          + Adicionar Item
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div>
          <label>Desconto (%)</label>
          <input
            type="number"
            step="0.01"
            value={form.discount_percent}
            onChange={(e) =>
              setForm({ ...form, discount_percent: parseFloat(e.target.value) || 0, discount_amount: 0 })
            }
            style={{ width: 100, padding: 8, borderRadius: 8, border: '1px solid #e9e6ea' }}
          />
        </div>
        <div>
          <label>Desconto (R$)</label>
          <input
            type="number"
            step="0.01"
            value={form.discount_amount}
            onChange={(e) =>
              setForm({ ...form, discount_amount: parseFloat(e.target.value) || 0, discount_percent: 0 })
            }
            style={{ width: 100, padding: 8, borderRadius: 8, border: '1px solid #e9e6ea' }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Observações</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          style={{ width: '100%', padding: 8, minHeight: 60, borderRadius: 8, border: '1px solid #e9e6ea' }}
        />
      </div>

      <div style={{ textAlign: 'right', marginBottom: 12 }}>
        <strong>
          Subtotal: R$ {calculateSubtotal().toFixed(2)}<br />
          Desconto: R$ {calculateDiscount().toFixed(2)}<br />
          Total: R$ {calculateTotal().toFixed(2)}
        </strong>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(90deg,#CFA6F7,#E77AAE)',
            color: '#fff',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer'
          }}
        >
          {loading ? 'Salvando...' : 'Salvar Venda'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #e9e6ea',
            background: 'transparent',
            cursor: 'pointer'
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}