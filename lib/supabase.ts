// lib/supabase.ts
'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Håll exakt EN klient i browsern (även vid HMR/refresh)
declare global {
  // eslint-disable-next-line no-var
  var __incheckad_supabase__: SupabaseClient | undefined;
}

const supabase: SupabaseClient =
  globalThis.__incheckad_supabase__ ??
  createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Egen nyckel för att undvika krockar när flera instanser laddas
      storageKey: 'incheckad-auth',
    },
  });

if (typeof window !== 'undefined') {
  globalThis.__incheckad_supabase__ = supabase;
}

export { supabase };
export default supabase;
