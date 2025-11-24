// pages/request-access.js
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import Layout from '../components/Layout';

export default function RequestAccess() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [birthday, setBirthday] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [email2, setEmail2] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') window.supabase = supabase;
    return () => clearInterval(cooldownRef.current);
  }, []);

  function onlyDigits(value = '') {
    return value.replace(/\D/g, '');
  }

  function formatPhoneInput(value = '') {
    const nums = onlyDigits(value).slice(0, 11);
    if (nums.length === 0) return '';
    if (nums.length <= 2) return `(${nums}`;
    if (nums.length <= 6) return `(${nums.slice(0,2)}) ${nums.slice(2)}`;
    const dd = nums.slice(0,2);
    const middle = nums.slice(2, nums.length - 4);
    const last4 = nums.slice(-4);
    return `(${dd}) ${middle}-${last4}`;
  }

  function handlePhoneChange(e) {
    setPhone(formatPhoneInput(e.target.value));
  }

  function validate() {
    if (!fullName.trim()) return 'Informe o nome completo.';
    if (!username.trim()) return 'Informe um nome para login (username).';
    if (!/^[a-zA-Z0-9._-]{2,}$/.test(username)) return 'Username inválido (use ao menos 2 caracteres, letras, números, ._-).';
    if (!email.trim() || !email2.trim()) return 'Informe o email e repita-o.';
    if (email.trim().toLowerCase() !== email2.trim().toLowerCase()) return 'Emails não conferem.';
    if (!password) return 'Informe a senha.';
    if (password !== password2) return 'Senhas não conferem.';
    if (password.length < 6) return 'Senha muito curta (mínimo 6 caracteres).';
    if (!phone || !/^\(\d{2}\) \d{4,5}-\d{4}$/.test(phone)) {
      return 'Telefone inválido. Use (xx) xxxxx-xxxx ou (xx) xxxx-xxxx.';
    }
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    if (cooldown > 0) return;
    setMsg('');
    const v = validate();
    if (v) return setMsg(v);
    setLoading(true);

    try {
      const { data: clash, error: clashErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .limit(1)
        .maybeSingle();

      if (clashErr) console.warn('erro checando username', clashErr);
      if (clash) {
        setMsg('Nome de usuário já existe, escolha outro.');
        setLoading(false);
        return;
      }

      const emailNormalized = email.trim().toLowerCase();

      console.log('[signup] calling supabase.auth.signUp for', emailNormalized, 'username=', username);

      const { data, error } = await supabase.auth.signUp({
        email: emailNormalized,
        password,
        options: {
          emailRedirectTo: 'http://localhost:3000/confirm-email',
          data: {
            full_name: fullName.trim(),
            username: username.trim(),
            phone: phone.trim(),
            birthday: birthday || null
          }
        }
      });

      console.log('signUp result:', { data, error });

      if (error) {
        if (error.message?.toLowerCase().includes('13 seconds')) {
          startCooldown(15);
          setMsg('Aguarde alguns segundos antes de tentar novamente.');
        } else {
          setMsg(error.message || 'Erro no cadastro (ver console).');
        }
        setLoading(false);
        return;
      }

      startCooldown(15);
      setMsg('Conta criada. Verifique seu email e confirme para acessar.');
    } catch (err) {
      console.error('Erro ao criar conta', err);
      setMsg('Erro ao criar conta: ' + (err.message || JSON.stringify(err)));
      startCooldown(15);
    } finally {
      setLoading(false);
    }
  }

  function startCooldown(seconds = 15) {
    setCooldown(seconds);
    clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  return (
    <Layout pageTitle="Solicitar Cadastro">
      <div style={{ maxWidth: 720, margin: '4px auto' }}>
        <div className="card">
          <h2>Solicitar Cadastro</h2>

          <form onSubmit={submit}>
            <label>Nome completo</label>
            <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} required />

            <label>Nome para login (username)</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} required />

            <label>Data de aniversário</label>
            <input className="input" type="date" value={birthday} onChange={e => setBirthday(e.target.value)} />

            <label>Telefone</label>
            <input
              className="input"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="(xx) xxxxx-xxxx"
              inputMode="numeric"
              required
            />

            <label>Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <label>Repita o email</label>
            <input className="input" type="email" value={email2} onChange={e => setEmail2(e.target.value)} required />

            <label>Senha</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            <label>Repita a senha</label>
            <input className="input" type="password" value={password2} onChange={e => setPassword2(e.target.value)} required />

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                className="btn primary"
                type="submit"
                disabled={loading || cooldown > 0}
              >
                {loading ? 'Enviando...' : cooldown > 0 ? `Aguarde ${cooldown}s` : 'Solicitar Cadastro'}
              </button>
              <Link href="/" className="btn ghost">Voltar ao Login</Link>
            </div>
          </form>

          {msg && <p style={{ color: msg.includes('Erro') ? '#9f1239' : '#059669', marginTop: 10 }}>{msg}</p>}
        </div>
      </div>
    </Layout>
  );
}