import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) router.push('/');
    }
    check();
  }, []);
  return children;
}
