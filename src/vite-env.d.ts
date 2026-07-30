/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_PORTAL?: 'admin' | 'cloud' | 'onprem'
  readonly VITE_DATA_SOURCE?: 'mock' | 'live'
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ENV?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
