// pages/signout.js
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

export default function SignOut() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      console.log('[SignOut] Chamando supabase.auth.signOut()...');
      try {
        await supabase.auth.signOut();
        console.log('[SignOut] Logout realizado com sucesso via Supabase.');
      } catch (err) {
        console.warn('[SignOut] Erro ao deslogar no Supabase:', err);
      } finally {
        // Limpeza extra (opcional): remove chaves do supabase no localStorage
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const keys = Object.keys(localStorage).filter(
              (k) =>
                k?.toLowerCase()?.includes('supabase') ||
                k?.startsWith('sb-') ||
                k?.startsWith('supabase')
            );
            keys.forEach((k) => localStorage.removeItem(k));
            console.log('[SignOut] Chaves do Supabase removidas do localStorage:', keys);
          }
        } catch (e) {
          console.warn('[SignOut] Erro ao limpar localStorage:', e);
        }

        // Redireciona para home
        try {
          console.log('[SignOut] Redirecionando para /');
          router.replace('/');
        } catch (e) {
          console.warn('[SignOut] Fallback window.location.replace');
          window.location.replace('/');
        }
      }
    })();
  }, [router]);

  return <div>Saindo... redirecionando para home.</div>;
}