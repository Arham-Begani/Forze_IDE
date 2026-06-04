/**
 * Code formatter for the editor — "Format Document" (Shift+Alt+F).
 *
 * Prettier is the same engine VS Code's formatter extension uses under the
 * hood, and it ships a *standalone* browser build (`prettier/standalone`) that
 * runs entirely inside the Tauri webview with no Node, no workers, and no CDN.
 * We lazy-load it (and only the language plugins a given file needs) the first
 * time the user formats, so it never touches the initial bundle or boot path.
 *
 * Prettier covers the languages an IDE actually spends its time in — JS/TS,
 * JSX/TSX, JSON, CSS/SCSS/LESS, HTML, Markdown, YAML, GraphQL. For everything
 * else (Rust, Python, Go, shell, SQL, TOML, plaintext…) Prettier has no parser,
 * so we fall back to a conservative whitespace tidy that can't change a file's
 * meaning: it only normalises line endings, strips trailing whitespace, caps
 * runs of blank lines, and guarantees a single trailing newline. That keeps
 * "Format Document" useful on every file while never mangling significant
 * whitespace (e.g. Python) or the inside of strings.
 */

import type { Plugin } from 'prettier';

export interface FormatResult {
  /** The formatted source. Equal to the input when nothing changed. */
  code: string;
  /** Whether formatting actually altered the source. */
  changed: boolean;
  /** Which engine produced the result — surfaced in the success toast. */
  engine: 'prettier' | 'tidy';
}

/** Prettier formatting options. Tuned to match this codebase's house style. */
const PRETTIER_OPTIONS = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
} as const;

/**
 * Map the IDE's internal language ids (see `languageFromPath`) to a Prettier
 * parser plus a loader for just the plugins that parser needs. Languages absent
 * from this table go through the whitespace-tidy fallback.
 */
type PluginLoader = () => Promise<Plugin[]>;

const PARSERS: Record<string, { parser: string; load: PluginLoader }> = {
  typescript: { parser: 'typescript', load: loadTypeScript },
  tsx: { parser: 'typescript', load: loadTypeScript },
  javascript: { parser: 'babel', load: loadBabel },
  jsx: { parser: 'babel', load: loadBabel },
  json: { parser: 'json', load: loadBabel },
  css: { parser: 'css', load: loadPostcss },
  scss: { parser: 'scss', load: loadPostcss },
  less: { parser: 'less', load: loadPostcss },
  html: { parser: 'html', load: loadHtml },
  vue: { parser: 'vue', load: loadHtml },
  markdown: { parser: 'markdown', load: loadMarkdown },
  yaml: { parser: 'yaml', load: loadYaml },
  graphql: { parser: 'graphql', load: loadGraphql },
};

/** A Prettier plugin module exposes the plugin as its default export. */
type PluginModule = { default: Plugin } | Plugin;
const asPlugin = (m: PluginModule): Plugin =>
  ('default' in m ? m.default : m) as Plugin;

async function loadTypeScript(): Promise<Plugin[]> {
  const [estree, ts] = await Promise.all([
    import('prettier/plugins/estree'),
    import('prettier/plugins/typescript'),
  ]);
  return [asPlugin(estree), asPlugin(ts)];
}

async function loadBabel(): Promise<Plugin[]> {
  const [estree, babel] = await Promise.all([
    import('prettier/plugins/estree'),
    import('prettier/plugins/babel'),
  ]);
  return [asPlugin(estree), asPlugin(babel)];
}

async function loadPostcss(): Promise<Plugin[]> {
  const postcss = await import('prettier/plugins/postcss');
  return [asPlugin(postcss)];
}

async function loadHtml(): Promise<Plugin[]> {
  // HTML/Vue can embed <script> and <style>, so bring the JS + CSS plugins too.
  const [html, estree, babel, postcss] = await Promise.all([
    import('prettier/plugins/html'),
    import('prettier/plugins/estree'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/postcss'),
  ]);
  return [asPlugin(html), asPlugin(estree), asPlugin(babel), asPlugin(postcss)];
}

async function loadMarkdown(): Promise<Plugin[]> {
  // Markdown can embed code fences; estree/babel let those be formatted too.
  const [markdown, estree, babel] = await Promise.all([
    import('prettier/plugins/markdown'),
    import('prettier/plugins/estree'),
    import('prettier/plugins/babel'),
  ]);
  return [asPlugin(markdown), asPlugin(estree), asPlugin(babel)];
}

async function loadYaml(): Promise<Plugin[]> {
  const yaml = await import('prettier/plugins/yaml');
  return [asPlugin(yaml)];
}

async function loadGraphql(): Promise<Plugin[]> {
  const graphql = await import('prettier/plugins/graphql');
  return [asPlugin(graphql)];
}

/** True when Prettier (rather than the tidy fallback) will handle a language. */
export function canPrettyPrint(language: string): boolean {
  return language.toLowerCase() in PARSERS;
}

/**
 * Conservative, meaning-preserving cleanup for languages Prettier can't parse.
 * Deliberately never re-indents — it only fixes whitespace that is safe to fix
 * regardless of the language (including whitespace-sensitive ones like Python).
 */
function tidy(code: string): string {
  const normalised = code.replace(/\r\n?/g, '\n');
  const cleaned = normalised
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/u, '')) // strip trailing whitespace
    .join('\n')
    .replace(/\n{3,}/g, '\n\n'); // cap blank-line runs at one
  // Exactly one trailing newline (and not on an otherwise-empty file).
  const trimmed = cleaned.replace(/\n+$/u, '');
  return trimmed.length === 0 ? '' : `${trimmed}\n`;
}

/**
 * Format `code` for the given language. Resolves with the formatted source and
 * whether it changed; rejects only when Prettier hits a genuine parse/syntax
 * error (so callers can show the message and leave the buffer untouched).
 */
export async function formatCode(code: string, language: string): Promise<FormatResult> {
  const entry = PARSERS[language.toLowerCase()];

  if (!entry) {
    const tidied = tidy(code);
    return { code: tidied, changed: tidied !== code, engine: 'tidy' };
  }

  const [{ format }, plugins] = await Promise.all([
    import('prettier/standalone'),
    entry.load(),
  ]);

  const formatted = await format(code, {
    ...PRETTIER_OPTIONS,
    parser: entry.parser,
    plugins,
  });

  return { code: formatted, changed: formatted !== code, engine: 'prettier' };
}
