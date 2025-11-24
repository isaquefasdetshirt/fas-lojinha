// components/AdminRoute.js
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';

export default function AdminRoute({ children, fallback = null }) {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();

  useEffect(() => {
    if (loading) return; // Aguarda carregar a autenticação
    if (!user) {
      router.replace('/login');
    } else if (!isAdmin) {
      router.replace('/'); // redireciona usuário não-admin
    }
  }, [loading, user, isAdmin, router]);

  if (loading) return <div>Carregando autenticação...</div>;
  if (!user) return fallback;
  if (!isAdmin) return fallback;

  return children;
}