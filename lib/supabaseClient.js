// lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const options = {
  auth: {
    persistSession: true,
    detectSessionInUrl: false, // já configurado por você
    autoRefreshToken: true
  }
};

// ensure singleton across HMR
const globalRef = typeof window !== 'undefined' ? window : globalThis;
if (!globalRef.__supabase) {
  globalRef.__supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
  console.log('[supabaseClient] created client');
} else {
  // console.debug('[supabaseClient] reuse existing client');
}

export const supabase = globalRef.__supabase;