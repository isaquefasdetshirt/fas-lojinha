// lib/authManager.js
import { supabase } from './supabaseClient';

const listeners = new Set();
let currentSession = null;
let initialized = false;
let subscription = null;

function ts() {
  return new Date().toISOString();
}

async function initOnce() {
  if (initialized) return;
  initialized = true;

  try {
    const { data } = await supabase.auth.getSession();
    currentSession = data?.session ?? null;
    console.log('[authManager] getSession result', {
      hasSession: !!currentSession,
      userId: currentSession?.user?.id ?? null,
      expiresAt: currentSession?.expires_at ?? null,
      ts: ts(),
    });
    dispatch({ event: 'INITIAL_SESSION', session: currentSession });
  } catch (err) {
    console.warn('[authManager] getSession error', err);
  }

  subscription = supabase.auth.onAuthStateChange((event, session) => {
    currentSession = session ?? null;
    console.log('[authManager] onAuthStateChange', event, {
      userId: session?.user?.id ?? null,
      expiresAt: session?.expires_at ?? null,
      ts: ts(),
    });
    dispatch({ event, session: currentSession });
  }).data?.subscription ?? null;
}

function dispatch(payload) {
  for (const cb of Array.from(listeners)) {
    try {
      cb(payload);
    } catch (e) {
      console.error('[authManager] listener error', e);
    }
  }
}

export function subscribeAuth(cb) {
  listeners.add(cb);
  initOnce()
    .then(() => {
      cb({ event: 'SYNC', session: currentSession });
    })
    .catch((e) => console.warn('[authManager] init error', e));
  return () => listeners.delete(cb);
}

export function getSessionSync() {
  return currentSession;
}

// opcional: para debug
export function debugListListeners() {
  return {
    count: listeners.size,
    initialized,
    hasSubscription: !!subscription,
  };
}