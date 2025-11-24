// hooks/useAuth.js
import { useEffect, useState } from 'react';
import { subscribeAuth, getSessionSync } from '../lib/authManager';

export function useAuth() {
  const initial = getSessionSync();
  const [user, setUser] = useState(initial?.user ?? null);
  const [loading, setLoading] = useState(initial === null);
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    const unsub = subscribeAuth(({ event, session }) => {
      setLastEvent(event);
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const isAdmin = Boolean(
    user?.user_metadata?.role === 'admin' ||
    user?.app_metadata?.role === 'admin'
  );

  return { user, loading, isAdmin, lastEvent };
}

export default useAuth;