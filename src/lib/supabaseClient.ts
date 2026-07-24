import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// createBrowserClient stores the session in cookies (not just localStorage),
// which makes it accessible to the middleware running on the server/edge.
export const supabase = isSupabaseConfigured
  ? createBrowserClient(supabaseUrl!, supabaseAnonKey!)
  : createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key-not-configured'
    );
