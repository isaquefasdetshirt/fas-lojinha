// components/SaleItemRow.js
import CodigoInput from './CodigoInput';

export default function SaleItemRow({ item, onChange, onRemove, allow3Digits = false }) {
  function update(patch) {
    onChange({ ...item, ...patch });
  }

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      marginBottom: 8,
      alignItems: 'center',
      padding: 8,
      borderRadius: 8,
      border: '1px solid #eee',
      background: '#fff'
    }}>
      <div style={{ flex: 1 }}>
        <CodigoInput
          value={item.codigo || ''}
          allow3Digits={allow3Digits}
          onChange={(v) => update({ codigo: v })}
          // sem câmera
        />
      </div>

      <input
        value={item.description || ''}
        onChange={(e) => update({ description: e.target.value })}
        placeholder="Descrição"
        style={{ flex: 2, padding: 8, borderRadius: 8, border: '1px solid #e9e6ea' }}
      />
      <input
        type="number"
        value={item.qty || ''}
        onChange={(e) => update({ qty: parseInt(e.target.value, 10) || 0 })}
        placeholder="Qtd"
        style={{ width: 80, padding: 8, borderRadius: 8, border: '1px solid #e9e6ea' }}
      />
      <input
        type="number"
        step="0.01"
        value={item.unit_price || ''}
        onChange={(e) => update({ unit_price: parseFloat(e.target.value) || 0 })}
        placeholder="Preço"
        style={{ width: 100, padding: 8, borderRadius: 8, border: '1px solid #e9e6ea' }}
      />
      <div style={{ width: 100, textAlign: 'right', fontWeight: 700 }}>
        R$ {(((item.qty || 0) * (item.unit_price || 0)) || 0).toFixed(2)}
      </div>
      <button
        onClick={onRemove}
        style={{
          padding: '6px 10px',
          borderRadius: 8,
          border: 'none',
          background: 'linear-gradient(90deg,#F7C6D9,#E77AAE)',
          color: '#fff',
          cursor: 'pointer'
        }}
      >
        Remover
      </button>
    </div>
  );
}