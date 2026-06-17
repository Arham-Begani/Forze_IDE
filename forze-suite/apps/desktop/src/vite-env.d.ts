/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FORGE_APP_URL?: string;
  /**
   * Built-in Gemini API key, baked in at build time. When set, Forze's general
   * model works with zero setup (no BYOK). When absent, Gemini falls back to
   * bring-your-own-key like Claude. See workbench/aiConfig.ts.
   */
  readonly VITE_FORZE_GEMINI_KEY?: string;
  /**
   * Forze account auth + cloud persistence. Same Supabase project as the web
   * app (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). The anon key
   * is safe to ship — Row Level Security is the boundary, not key secrecy.
   * See lib/supabase.ts.
   */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
