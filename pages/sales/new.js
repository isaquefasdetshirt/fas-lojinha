// pages/sales/new.js
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';

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

export default function NewSale() {
  const router = useRouter();
  const { customerId: initialCustomerId } = router.query;

  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(initialCustomerId || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saleDiscountType, setSaleDiscountType] = useState('reais');
  const [saleDiscountValue, setSaleDiscountValue] = useState(0);
  const [msg, setMsg] = useState('');
  const [saleNotes, setSaleNotes] = useState('');

  // auth-related local state (pattern like payments/new.js)
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creatorNameMap, setCreatorNameMap] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const { data: userResp } = await supabase.auth.getUser();
        // supabase client may return different shapes; be defensive
        const user = userResp?.user ?? (userResp ?? null);
        if (!user) {
          router.replace('/login');
          return;
        }
        setCurrentUserId(user.id);

        // determine admin flag (try v_app_users then fallback to metadata)
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

        setItems([createEmptyItem()]);
        await loadCustomers(user, adminFlag);
      } catch (err) {
        console.error('[init] erro', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCustomers(userParam = null, adminFlagParam = null) {
    try {
      let user = userParam;
      if (!user) {
        const { data: userResp } = await supabase.auth.getUser();
        user = userResp?.user ?? (userResp ?? null);
      }
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

      // populate creatorNameMap with created_by values present in customers list
      await populateCreatorNameMap(data || [], user?.id);
      // choose default customer if none selected
      if ((!customerId || customerId === '') && (data || []).length > 0) {
        if (initialCustomerId && (data || []).some(c => String(c.customer_id) === String(initialCustomerId))) {
          setCustomerId(initialCustomerId);
        } else {
          setCustomerId(data[0].customer_id);
        }
      }
    } catch (err) {
      console.error('[loadCustomers]', err);
      setCustomers([]);
      setCreatorNameMap({});
    }
  }

  async function populateCreatorNameMap(customersList, currentUserIdParam = null) {
    try {
      const uniq = [...new Set((customersList || []).map(c => c.created_by).filter(Boolean))];
      const curId = currentUserIdParam ?? currentUserId;
      if (curId && !uniq.includes(curId)) uniq.push(curId);

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

      // fallback: if still missing for current user, set "Eu"
      if (curId && !nameMap[String(curId)]) nameMap[String(curId)] = 'Eu';

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
      // get current user defensively
      const usrResp = await supabase.auth.getUser();
      const user = usrResp?.data?.user ?? usrResp?.user ?? usrResp ?? null;
      const userId = user?.id ?? currentUserId;
      if (!userId) {
        alert('Você precisa estar logado para registrar vendas.');
        setLoading(false);
        return;
      }

      if (!isAdmin) {
        try {
          const { data: custCheck, error: errCheck } = await supabase
            .from('customers')
            .select('customer_id')
            .eq('customer_id', customerId)
            .eq('created_by', userId)
            .limit(1);
          if (errCheck) throw errCheck;
          if (!custCheck || custCheck.length === 0) {
            alert('Você só pode registrar vendas para clientes que você mesmo cadastrou.');
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('[handleSave] verificação customer pertenca falhou', err);
          alert('Erro ao validar cliente selecionado: ' + (err.message || err));
          setLoading(false);
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
        notes: saleNotes || null,
        created_by: userId
      };

      // Minimal change: request controle_vendas explicitly from insert
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([salePayload])
        .select('sale_id, controle_vendas')
        .single();

      if (saleError) {
        console.error('sales insert error', saleError);
        setMsg('Erro ao salvar venda: ' + (saleError.message || saleError));
        setLoading(false);
        return;
      }

      const saleId = saleData.sale_id ?? saleData.id ?? null;
      if (!saleId) {
        setMsg('Erro: sale_id não retornado pelo insert.');
        setLoading(false);
        return;
      }

      // use controle_vendas when available
      const displaySaleNumber = saleData.controle_vendas ?? saleId;

      let itemsToInsert = itemLines.map(l => ({
        ...l,
        sale_id: saleId,
        customer_id: customerId,
        data_item: date,
        created_by: userId
      }));

      if (saleDiscAmt > 0) {
        const discountLine = {
          codigo: 'DESCONTO',
          item: 'Desconto da venda',
          quantity: 1,
          unit_price: -saleDiscAmt,
          discount_real_i: 0,
          discount_percent_i: 0,
          line_total: -saleDiscAmt,
          note_i: `Desconto aplicado na venda #${displaySaleNumber}`,
          sale_id: saleId,
          customer_id: customerId,
          data_item: date,
          created_by: userId
        };
        itemsToInsert.push(discountLine);
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from('sale_items')
        .insert(itemsToInsert)
        .select();

      if (itemsError) {
        console.error('sale_items insert error', itemsError);

        const msgLower = String(itemsError.message || '').toLowerCase();
        if (msgLower.includes('refresh_sale_total') || msgLower.includes('function public.refresh_sale_total') || msgLower.includes('trigger')) {
          setMsg('Erro ao salvar itens: função trigger do banco (refresh_sale_total) não existe ou está com assinatura incorreta. Veja a instrução SQL sugerida no console.');
          console.error(`[SQL SUGERIDO] CREATE OR REPLACE FUNCTION public.refresh_sale_total(p_sale_id bigint) ...`);
        } else {
          setMsg('Erro ao salvar itens: ' + (itemsError.message || itemsError));
        }

        setLoading(false);
        return;
      }

      setMsg('Venda salva com sucesso!');
      router.replace('/sales');
    } catch (err) {
      console.error(err);
      setMsg('Erro inesperado: ' + (err.message || err));
      setLoading(false);
    }
  };

  // render
  return (
    <Layout pageTitle="Nova Venda" loggedUserName={null}>
      <style>{`
        :root {
          --card-bg: #ffffff;
          --border: #e9e6ea;
          --muted: #6b7280;
          --brand-start: #FDE9B8;
          --brand-end: #E77AAE;
        }
        .page-container { max-width: 900px; margin: 0 auto; padding: 20px; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; box-shadow: 0 8px 24px rgba(15,23,42,0.04); }
        button { background: linear-gradient(90deg,var(--brand-start),var(--brand-end)); color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-weight:700; }
        button[disabled] { opacity: 0.6; cursor: not-allowed; }
        input, select, textarea { border: 1px solid var(--border); padding: 8px; border-radius: 8px; }
      `}</style>

      <div className="page-container">
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Nova Venda</h1>

          <form onSubmit={submit}>
            <label>Cliente</label><br />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e9e6ea' }}
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
                    <button type="button" onClick={() => removeItem(it.id)} disabled={items.length === 1} style={{ padding: 8, borderRadius: 8 }}>
                      Remover
                    </button>
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