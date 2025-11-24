// pages/sales/[id]/edit.js
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../../components/Layout';

function moneyFormat(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));
}
function formatDateBR(dateString) {
  if (!dateString) return '';
  const parts = String(dateString).split('-');
  if (parts.length !== 3) return dateString;
  const [y, m, d] = parts;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

export default function EditSale() {
  const router = useRouter();
  const { id } = router.query;

  // auth local state (pegamos via supabase.auth.getUser)
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saleDiscountType, setSaleDiscountType] = useState('reais');
  const [saleDiscountValue, setSaleDiscountValue] = useState(0);
  const [msg, setMsg] = useState('');
  const [saleNotes, setSaleNotes] = useState('');

  const [creatorNameMap, setCreatorNameMap] = useState({});

  // New states to display controle_vendas and customer name
  const [controleVendaNum, setControleVendaNum] = useState(null);
  const [customerName, setCustomerName] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setAuthLoading(true);
        const { data: userResp } = await supabase.auth.getUser();
        const user = userResp?.user ?? userResp ?? null;
        if (!user) {
          setAuthLoading(false);
          router.replace('/login');
          return;
        }
        setCurrentUser(user);
        setCurrentUserId(user.id);

        setItems([createEmptyItem()]);

        // detect admin and load customers
        let adminFlag = false;
        try {
          const { data: vusers } = await supabase.from('v_app_users').select('role').eq('id', user.id).limit(1);
          if (vusers && vusers.length) adminFlag = String(vusers[0].role || '').toLowerCase().includes('admin');
          else {
            const um = user.user_metadata ?? user.app_metadata ?? {};
            const roleFromMetadata = um?.role || um?.roles || um?.is_admin;
            adminFlag = (typeof roleFromMetadata === 'string' && roleFromMetadata.toLowerCase().includes('admin')) || roleFromMetadata === 'admin' || roleFromMetadata === true;
          }
        } catch {
          const um = user.user_metadata ?? user.app_metadata ?? {};
          const roleFromMetadata = um?.role || um?.roles || um?.is_admin;
          adminFlag = (typeof roleFromMetadata === 'string' && roleFromMetadata.toLowerCase().includes('admin')) || roleFromMetadata === 'admin' || roleFromMetadata === true;
        }
        setIsAdmin(adminFlag);

        await loadCustomers(user, adminFlag);
      } catch (err) {
        console.error('[init auth] erro', err);
      } finally {
        setAuthLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authLoading || !currentUser || !id) return;
    loadSale(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser, id]);

  async function loadCustomers(userParam = null, adminFlagParam = null) {
    try {
      let user = userParam ?? currentUser;
      let adminFlag = adminFlagParam;
      if (adminFlag === undefined || adminFlag === null) adminFlag = isAdmin;

      let q = supabase.from('customers').select('customer_id, customer_name, created_by').order('customer_name');
      if (!adminFlag) {
        if (user?.id) q = q.eq('created_by', user.id);
        else {
          setCustomers([]);
          setCreatorNameMap({});
          return;
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      setCustomers(data || []);

      await populateCreatorNameMap(data || []);
    } catch (err) {
      console.error('[loadCustomers]', err);
      setCustomers([]);
      setCreatorNameMap({});
    }
  }

  async function populateCreatorNameMap(customersList) {
    try {
      const uniq = [...new Set((customersList || []).map(c => c.created_by).filter(Boolean))];
      if (uniq.length === 0) {
        setCreatorNameMap({});
        return;
      }

      let nameMap = {};
      try {
        const { data: vusers } = await supabase.from('v_app_users').select('id, full_name').in('id', uniq);
        if (vusers) vusers.forEach(u => { nameMap[String(u.id)] = u.full_name || u.id; });
      } catch (e) {
        console.warn('[populateCreatorNameMap] v_app_users falhou', e);
      }

      const missing = uniq.filter(id => !nameMap[String(id)]);
      if (missing.length > 0) {
        try {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', missing);
          if (profiles) profiles.forEach(p => { nameMap[String(p.id)] = p.full_name || p.id; });
        } catch (e) {
          console.warn('[populateCreatorNameMap] profiles falhou', e);
        }
      }

      // fallback: current user label
      if (currentUserId && !nameMap[String(currentUserId)]) nameMap[String(currentUserId)] = 'Eu';

      setCreatorNameMap(nameMap);
    } catch (err) {
      console.error('[populateCreatorNameMap] erro', err);
      setCreatorNameMap({});
    }
  }

  function createEmptyItem() {
    return {
      id: Math.random().toString(36).slice(2, 9),
      codigo: '',
      description: '',
      quantity: 1,
      unit_price: 0,
      discount_type: 'reais',
      discount_value: 0,
      note: '',
    };
  }
  function updateItem(id, patch) { setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it))); }
  function addItem() { setItems(prev => [...prev, createEmptyItem()]); }
  function removeItem(id) { setItems(prev => prev.filter(it => it.id !== id)); }

  function computeItemLineDisplay(item) {
    const q = Number(item.quantity) || 0;
    const up = Number(item.unit_price) || 0;
    const dv = Number(item.discount_value) || 0;
    const gross = up * q;
    if (item.discount_type === 'percent') {
      const discountPercentAmount = gross * (dv / 100.0);
      return Number(Math.max(0, gross - discountPercentAmount).toFixed(2));
    } else {
      return Number(Math.max(0, gross - dv).toFixed(2));
    }
  }
  function computeSubtotalBeforeSaleDiscount() {
    return items.reduce((acc, it) => acc + computeItemLineDisplay(it), 0);
  }
  function computeSaleDiscountAmount(subtotalBefore) {
    const disc = Number(saleDiscountValue || 0);
    if (!subtotalBefore || subtotalBefore <= 0) return 0;
    if (saleDiscountType === 'percent') return subtotalBefore * (disc / 100.0);
    return disc;
  }
  function computeFinalTotal() {
    const subtotal = computeSubtotalBeforeSaleDiscount();
    const saleDisc = computeSaleDiscountAmount(subtotal);
    return Number(Math.max(0, subtotal - saleDisc).toFixed(2));
  }

  async function loadSale(saleId) {
    setLoading(true);
    setMsg('');
    try {
      // Request controle_vendas and customer name along with other fields
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .select('sale_id, controle_vendas, date, total_amount, discount_real, discount_percent, final_total, notes, customer_id, created_by, customers(customer_name)')
        .eq('sale_id', saleId)
        .single();

      if (saleErr) throw saleErr;
      if (!saleData) {
        setMsg('Venda não encontrada.');
        setLoading(false);
        return;
      }

      if (!isAdmin && saleData.created_by && String(saleData.created_by) !== String(currentUserId)) {
        alert('Você não tem permissão para editar essa venda.');
        router.replace('/sales');
        return;
      }

      const { data: itemsData, error: itemsErr } = await supabase
        .from('sale_items')
        .select('id, codigo, item, quantity, unit_price, discount_real_i, discount_percent_i, note_i, line_total')
        .eq('sale_id', saleId)
        .order('id', { ascending: true });

      if (itemsErr) throw itemsErr;

      const mappedItems = (itemsData || []).map(it => {
        const discount_real_i = Number(it.discount_real_i || 0);
        const discount_percent_i = Number(it.discount_percent_i || 0);
        const discount_type = discount_percent_i > 0 ? 'percent' : 'reais';
        const discount_value = discount_percent_i > 0 ? discount_percent_i : discount_real_i;
        return {
          id: it.id ?? Math.random().toString(36).slice(2, 9),
          codigo: it.codigo || '',
          description: it.item || '',
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          discount_type,
          discount_value,
          note: it.note_i || ''
        };
      });

      setCustomerId(saleData.customer_id);
      setDate(saleData.date ? saleData.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
      if (Number(saleData.discount_percent || 0) > 0) {
        setSaleDiscountType('percent');
        setSaleDiscountValue(Number(saleData.discount_percent || 0));
      } else {
        setSaleDiscountType('reais');
        setSaleDiscountValue(Number(saleData.discount_real || 0));
      }
      setSaleNotes(saleData.notes || '');
      setItems(mappedItems.length ? mappedItems : [createEmptyItem()]);

      // Set the controle_vendas and customerName states
      setControleVendaNum(saleData.controle_vendas ?? saleData.sale_id);
      setCustomerName(saleData.customers?.customer_name ?? null);
    } catch (err) {
      console.error('[loadSale] erro', err);
      setMsg('Erro ao carregar venda: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  const submit = async (e) => {
    e?.preventDefault?.();
    setMsg('');
    if (!customerId) { setMsg('Selecione um cliente'); return; }
    if (!date) { setMsg('Selecione a data'); return; }
    if (!items || items.length === 0) { setMsg('Adicione ao menos um item'); return; }
    for (const it of items) {
      const up = Number(it.unit_price || 0);
      if (up < 0) { setMsg('Valor unitário inválido.'); return; }
      const qty = Number(it.quantity || 0);
      if (qty <= 0) { setMsg('Cada item precisa ter quantidade mínima 1.'); return; }
      const dv = Number(it.discount_value || 0);
      if (dv < 0) { setMsg('Desconto inválido em um dos itens.'); return; }
    }

    setLoading(true);
    setMsg('Salvando venda...');

    try {
      if (!isAdmin) {
        const { data: saleCheck, error: saleCheckErr } = await supabase
          .from('sales')
          .select('sale_id, created_by')
          .eq('sale_id', id)
          .limit(1);
        if (saleCheckErr) throw saleCheckErr;
        if (!saleCheck || saleCheck.length === 0) {
          alert('Venda não encontrada ou você não tem permissão.');
          setLoading(false);
          return;
        }
        const saleRow = saleCheck[0];
        if (saleRow.created_by && String(saleRow.created_by) !== String(currentUserId)) {
          alert('Você só pode editar vendas que você mesmo criou.');
          setLoading(false);
          router.replace('/sales');
          return;
        }
      }

      const itemLines = items.map(it => {
        const up = Number(it.unit_price || 0);
        const qty = Number(it.quantity || 0);
        const dv = Number(it.discount_value || 0);
        const lineTotal = computeItemLineDisplay(it);
        return {
          codigo: it.codigo || null,
          item: it.description || null,
          quantity: qty,
          unit_price: up,
          discount_real_i: it.discount_type === 'reais' ? Number(dv) : 0,
          discount_percent_i: it.discount_type === 'percent' ? Number(dv) : 0,
          line_total: lineTotal,
          note_i: it.note || null
        };
      });

      const subtotal = computeSubtotalBeforeSaleDiscount();
      const saleDiscAmt = Number(computeSaleDiscountAmount(subtotal).toFixed(2));
      const totalAmount = Number(subtotal.toFixed(2));
      const finalTotal = Number((subtotal - saleDiscAmt).toFixed(2));

      const salePayload = {
        customer_id: customerId,
        date,
        total_amount: totalAmount,
        discount_real: saleDiscountType === 'reais' ? Number(saleDiscountValue || 0) : 0,
        discount_percent: saleDiscountType === 'percent' ? Number(saleDiscountValue || 0) : 0,
        final_total: finalTotal,
        notes: saleNotes || null
      };

      const { error: saleErr } = await supabase.from('sales').update(salePayload).eq('sale_id', id);
      if (saleErr) {
        console.error('sales update error', saleErr);
        setMsg('Erro ao atualizar venda: ' + (saleErr.message || saleErr));
        setLoading(false);
        return;
      }

      const { error: delErr } = await supabase.from('sale_items').delete().eq('sale_id', id);
      if (delErr) {
        console.error('sale_items delete error', delErr);
        setMsg('Erro ao remover itens antigos: ' + (delErr.message || delErr));
        setLoading(false);
        return;
      }

      let itemsToInsert = itemLines.map(l => ({
        ...l,
        sale_id: id,
        customer_id: customerId,
        data_item: date,
        created_by: currentUserId
      }));

      if (saleDiscAmt > 0) {
        // Use controleVendaNum (fetched earlier) when available
        const displaySaleNumber = controleVendaNum ?? id;

        const discountLine = {
          codigo: 'DESCONTO',
          item: 'Desconto da venda',
          quantity: 1,
          unit_price: -saleDiscAmt,
          discount_real_i: 0,
          discount_percent_i: 0,
          line_total: -saleDiscAmt,
          note_i: `Desconto aplicado na venda #${displaySaleNumber}`,
          sale_id: id,
          customer_id: customerId,
          data_item: date,
          created_by: currentUserId
        };
        itemsToInsert.push(discountLine);
      }

      const { data: insertedItems, error: itemsErr } = await supabase.from('sale_items').insert(itemsToInsert).select();
      if (itemsErr) {
        console.error('sale_items insert error', itemsErr);
        const msgLower = String(itemsErr.message || '').toLowerCase();
        if (msgLower.includes('refresh_sale_total') || msgLower.includes('function public.refresh_sale_total') || msgLower.includes('trigger')) {
          setMsg('Erro ao salvar itens: função trigger do banco (refresh_sale_total) não existe ou está com assinatura incorreta. Verifique a função no DB.');
        } else {
          setMsg('Erro ao salvar itens: ' + (itemsErr.message || itemsErr));
        }
        setLoading(false);
        return;
      }

      setMsg('Venda atualizada com sucesso!');
      router.replace('/sales');
    } catch (err) {
      console.error(err);
      setMsg('Erro inesperado: ' + (err.message || err));
      setLoading(false);
    }
  };

  if (authLoading) {
    return <div>Carregando autenticação...</div>;
  }

  const loggedUserName = null; // deixar Layout decidir

  // Prepare display values (fallbacks)
  const displaySaleLabel = controleVendaNum ? `#${controleVendaNum}` : `#${id}`;
  const displayTitle = customerName ? `Editar Venda ${displaySaleLabel} — ${customerName}` : `Editar Venda ${displaySaleLabel}`;

  return (
    <Layout pageTitle={displayTitle} loggedUserName={loggedUserName}>
      <style>{`
        :root {
          --card-bg: #ffffff;
          --border: #e9e6ea;
          --brand-start: #FDE9B8;
          --brand-end: #E77AAE;
        }
        .page { max-width: 900px; margin: 0 auto; padding: 20px; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; box-shadow: 0 8px 24px rgba(15,23,42,0.04); }
        input, select, textarea { padding: 8px; border-radius: 8px; border: 1px solid var(--border); }
        button { background: linear-gradient(90deg,var(--brand-start),var(--brand-end)); color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
      `}</style>

      <div className="page">
        <div className="card">
          <h1 style={{ marginTop: 0 }}>{displayTitle}</h1>

          <form onSubmit={submit}>
            <label>Cliente</label><br />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">-- selecione --</option>
                {customers.map(c => {
                  let label = c.customer_name ?? '—';
                  if (isAdmin && c.created_by) {
                    const cid = String(c.created_by);
                    const uid = String(currentUserId ?? '');
                    if (uid && cid === uid) {
                      label += ' (me)';
                    } else {
                      const creatorLabel = creatorNameMap[String(cid)] ?? creatorNameMap[c.created_by] ?? c.created_by;
                      label += ` — ${creatorLabel}`;
                    }
                  }
                  return <option key={c.customer_id} value={c.customer_id}>{label}</option>;
                })}
              </select>

              <Link href={{
                pathname: '/customers/new',
                query: { returnTo: router.asPath }
              }}>
                <button type="button">Cadastrar cliente</button>
              </Link>
            </div>

            <label>Data</label><br />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ marginBottom: 12, padding: 8, borderRadius: 8 }} />

            <h3>Itens</h3>
            {items.map((it) => (
              <div key={it.id} style={{ border: '1px solid #eee', padding: 10, marginBottom: 8, borderRadius: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 2 }}>
                    <label>Código (opcional)</label>
                    <input value={it.codigo} onChange={e => updateItem(it.id, { codigo: e.target.value })} placeholder="AA00.11B2" style={{ width: '100%', padding: 8, borderRadius: 8 }} />
                  </div>
                  <div style={{ flex: 4 }}>
                    <label>Descrição (opcional)</label>
                    <input value={it.description} onChange={e => updateItem(it.id, { description: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 8 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Quantidade</label>
                    <input type="number" min="1" value={it.quantity} onChange={e => updateItem(it.id, { quantity: Math.max(1, Number(e.target.value || 1)) })} style={{ width: '100%', padding: 8, borderRadius: 8 }} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label>Valor unitário (R$) *</label>
                    <input type="number" step="0.01" value={it.unit_price} onChange={e => updateItem(it.id, { unit_price: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 8 }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 2 }}>
                    <label>Desconto</label><br />
                    <select value={it.discount_type} onChange={e => updateItem(it.id, { discount_type: e.target.value })} style={{ padding: 8, borderRadius: 8 }}>
                      <option value="reais">R$</option>
                      <option value="percent">%</option>
                    </select>
                    <input type="number" step="0.01" value={it.discount_value} onChange={e => updateItem(it.id, { discount_value: e.target.value })} style={{ marginLeft: 8, padding: 8, borderRadius: 8 }} />
                  </div>

                  <div style={{ flex: 2 }}>
                    <label>Total do item (após desconto do item)</label><br />
                    <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 8 }}>{moneyFormat(computeItemLineDisplay(it))}</div>
                  </div>

                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                    <button type="button" onClick={() => removeItem(it.id)} disabled={items.length === 1}>Remover</button>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <label>Nota do item (opcional)</label>
                  <textarea value={it.note} onChange={e => updateItem(it.id, { note: e.target.value })} rows={2} style={{ width: '100%', padding: 8, borderRadius: 8 }} />
                </div>
              </div>
            ))}

            <div style={{ marginBottom: 12 }}>
              <button type="button" onClick={addItem}>Adicionar outro item</button>
            </div>

            <h3>Resumo</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div>Subtotal (após desconto por item): <strong>{moneyFormat(computeSubtotalBeforeSaleDiscount())}</strong></div>
                <div style={{ marginTop: 8 }}>
                  <label>Desconto da venda</label><br />
                  <select value={saleDiscountType} onChange={e => setSaleDiscountType(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
                    <option value="reais">R$</option>
                    <option value="percent">%</option>
                  </select>
                  <input type="number" step="0.01" value={saleDiscountValue} onChange={e => setSaleDiscountValue(e.target.value)} style={{ marginLeft: 8, padding: 8, borderRadius: 8 }} />
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: 20,
              marginBottom: 20
            }}>
              <div style={{
                width: 420,
                padding: 20,
                borderRadius: 8,
                background: '#ffffff',
                boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 13, color: '#666' }}>Total após desconto da venda</div>
                <div style={{ fontSize: 34, fontWeight: 800, color: '#1b5e20', marginTop: 8 }}>
                  {moneyFormat(computeFinalTotal())}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#777' }}>
                  Itens: {items.length} • Data: {formatDateBR(date)}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>Nota da venda (opcional)</label>
              <textarea value={saleNotes} onChange={e => setSaleNotes(e.target.value)} rows={2} style={{ width: '100%', padding: 8, borderRadius: 8 }} />
            </div>

            <div style={{ marginTop: 12 }}>
              <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar Venda'}</button>
              <Link href="/sales"><button type="button" style={{ marginLeft: 8 }}>Cancelar</button></Link>
            </div>

            <p style={{ color: 'red' }}>{msg}</p>
          </form>
        </div>
      </div>
    </Layout>
  );
}