import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Define estas variables en .env (local) y en Vercel → Settings → Environment Variables.
// Sin ellas la app funciona igual, pero solo con datos en el dispositivo (sin nube).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

let client: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    client = createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (e) {
    console.error('Supabase error:', e);
  }
} else {
  console.warn('Supabase no configurado: faltan VITE_SUPABASE_URL y VITE_SUPABASE_KEY');
}

export const supabaseClient = client;
