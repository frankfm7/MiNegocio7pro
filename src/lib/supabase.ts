import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lwhcwqbplcnpywlqaxmx.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_laEXA-Sw0jVSHnlHkrjYeg_uSffZt7U';

let client: SupabaseClient | null = null;
try {
  client = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
  console.error('Supabase error:', e);
}

export const supabaseClient = client;
