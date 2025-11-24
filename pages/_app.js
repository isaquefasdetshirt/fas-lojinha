// pages/_app.js
import '../styles/globals.css';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth'; // usa o hook baseado em authManager

const NavBar = dynamic(() => import('../components/NavBar'), { ssr: false });

function parseHashToObject(fragment) {
  if (!fragment) return {};
  const trimmed = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const params = new URLSearchParams(trimmed);
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    async function trySetSessionFromHashAndRedirect() {
      try {
        const frag = window.location.hash || window.location.search || '';
        if (!frag) return;
        const parsed = parseHashToObject(frag);
        const access_token = parsed.access_token || parsed['access-token'];
        const refresh_token = parsed.refresh_token;
        if (!access_token) return;

        await supabase.auth.setSession({ access_token, refresh_token });
        sessionStorage.setItem('isRecoveryFlow', '1');
        const target = '/reset-password?recovery=1';
        window.history.replaceState({}, document.title, '/');
        window.location.replace(target);
      } catch (err) {
        console.warn('Erro ao processar token do hash:', err);
      }
    }

    // Só roda no client
    if (typeof window !== 'undefined') {
      trySetSessionFromHashAndRedirect();
    }
  }, [router]);

  // páginas públicas que não devem ser forçadas a login
  const publicRoutes = ['/login', '/request-access', '/reset-password', '/'];

  useEffect(() => {
    // redireciona se não autenticado e não for rota pública
    if (!loading && !user && !publicRoutes.includes(router.pathname)) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading && !publicRoutes.includes(router.pathname)) {
    return <div>Carregando autenticação...</div>;
  }

  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Minha Loja</title>
      </Head>

      <NavBar />

      <main style={{ padding: 20 }}>
        <Component {...pageProps} />
      </main>
    </>
  );
}