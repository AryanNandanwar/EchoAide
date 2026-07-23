import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials not found in environment variables');
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'https://test-project.supabase.co',
  SUPABASE_ANON_KEY || 'test-anon-key',
);

export default supabase;
