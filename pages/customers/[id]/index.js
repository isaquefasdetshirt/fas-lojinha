// pages/customers/[id].js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabaseClient';
import Layout from '../../../components/Layout';

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
}

export default function CustomerSalesPage() {
  const router = useRouter();
  const { id } = router.query;
  const [customer, setCustomer] = useState(null);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState('');
  const [totals, setTotals] = useState({ total_compras: 0, total_pagos: 0 });

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data: cust, error: custError } = await supabase
          .from('customers')
          .select('*')
          .eq('customer_id', id)
          .single();
        if (custError) console.warn('cliente load error', custError);
        setCustomer(cust || null);
        await loadSales(id, month);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function loadSales(customerId, monthStr) {
    setLoading(true);
    try {
      let query = supabase
        .from('v_sales_with_items')
        .select('*')
        .eq('customer_id', customerId)
        .order('date', { ascending: false });

      if (monthStr) {
        const [y, m] = monthStr.split('-');
        const start = new Date(Number(y), Number(m) - 1, 1).toISOString().slice(0, 10);
        const end = new Date(Number(y), Number(m), 1).toISOString().slice(0, 10);
        query = query.gte('date', start).lt('date', end);
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = data || [];

      const normalized = rows.map(r => ({
        ...r,
        items: (r.items === null) ? [] : (typeof r.items === 'string' ? JSON.parse(r.items) : r.items)
      }));

      setSales(normalized);

      const totalCompras = normalized.reduce((s, it) => s + Number(it.final_total || 0), 0);
      const totalPagos = normalized.reduce((s, it) => s + Number(it.payment_amount || 0), 0);
      setTotals({ total_compras: totalCompras, total_pagos: totalPagos });
    } catch (err) {
      console.error('Erro ao carregar vendas', err);
    } finally {
      setLoading(false);
    }
  }

  function onFilterChange(e) {
    const val = e.target.value;
    setMonth(val);
    if (id) loadSales(id, val);
  }

  return (
    <Layout pageTitle={customer ? `Cliente — ${customer.customer_name}` : 'Cliente'}>
      <div style={{ maxWidth: 1000 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Cliente: {customer ? customer.customer_name : '...'}</h1>
          <div>
            <a href="/customers">&larr; Voltar para lista de clientes</a>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Filtrar por mês:</label>{' '}
          <input type="month" value={month} onChange={onFilterChange} />
          <button type="button" onClick={() => { setMonth(''); if (id) loadSales(id, ''); }} style={{ marginLeft: 8 }}>Limpar</button>
        </div>

        {loading ? <div>Carregando...</div> : (
          <>
            {sales.map(sale => (
              <div key={sale.sale_id} className="card" style={{ padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div><strong>Data:</strong> {sale.date ? sale.date.slice(0,10) : '-'}</div>
                  <div><strong>Venda #</strong> {sale.sale_id}</div>
                </div>

                <p><strong>Total:</strong> {formatBRL(sale.final_total)}</p>
                <p><strong>Pago:</strong> {sale.payment_amount ? formatBRL(sale.payment_amount) : 'Na confiança'}</p>
                <p><strong>Forma:</strong> {sale.payment_method || '-'}</p>
                <p><strong>Notas:</strong> {sale.notes || '-'}</p>

                <h4>Itens</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Descrição</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>Qtd</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>Unit</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>Desconto</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.items && sale.items.length > 0 ? sale.items.map((it, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '6px 0' }}>{it.description || it.item_code || '-'}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right' }}>{it.quantity ?? '-'}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right' }}>{formatBRL(it.unit_price)}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right' }}>{it.discount_amount ? formatBRL(it.discount_amount) : (it.discount_percent ? it.discount_percent + '%' : '-')}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right' }}>{formatBRL(it.line_total)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5}>Nenhum item registrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}

            {sales.length === 0 && <p>Nenhuma venda encontrada</p>}

            <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 12 }}>
              <div><strong>Total Compras:</strong> {formatBRL(totals.total_compras)}</div>
              <div><strong>Total Pagos:</strong> {formatBRL(totals.total_pagos)}</div>
              <div><strong>Saldo:</strong> {formatBRL(totals.total_compras - totals.total_pagos)}</div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}