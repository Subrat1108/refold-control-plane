import { createClient } from '@supabase/supabase-js'

// Browser Supabase client. Uses the anon key (RLS-gated) — never the
// service-role key (that lives only in Edge Function env). Values from
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  // Surfaced early in dev so a missing env is obvious rather than a cryptic 401.
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see .env.example')
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
