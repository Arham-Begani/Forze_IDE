/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FORGE_APP_URL?: string;
  /**
   * Built-in Gemini API key, baked in at build time. When set, Forze's general
   * model works with zero setup (no BYOK). When absent, Gemini falls back to
   * bring-your-own-key like Claude. See workbench/aiConfig.ts.
   */
  readonly VITE_FORZE_GEMINI_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
