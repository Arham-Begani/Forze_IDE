import { createElement, type ReactNode } from 'react';
import hljs from 'highlight.js';

/**
 * Syntax highlighting for the code editor overlay, powered by highlight.js
 * (~190 languages). highlight.js escapes the source and wraps tokens in
 * `<span class="hljs-…">` while preserving every character and newline exactly
 * — which is what keeps the highlighted <pre> aligned, char-for-char, with the
 * transparent <textarea> layered on top of it. Token colours live in the
 * `.hljs-*` rules in index.css.
 *
 * We render the resulting HTML with dangerouslySetInnerHTML. This is safe: the
 * input is the user's own file, highlight.js HTML-escapes all of it, and the
 * output is markup we generated (never executed as script).
 */

/** Map the IDE's internal language ids (from languageFromPath) to hljs names. */
const LANGUAGE_ALIASES: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'javascript',
  jsx: 'javascript',
  tsx: 'typescript',
  json: 'json',
  markdown: 'markdown',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  rust: 'rust',
  python: 'python',
  go: 'go',
  shell: 'bash',
  bash: 'bash',
  sh: 'bash',
  zsh: 'bash',
  sql: 'sql',
  prisma: 'typescript', // closest grammar; prisma isn't a built-in hljs language
  dockerfile: 'dockerfile',
  c: 'c',
  cpp: 'cpp',
  csharp: 'csharp',
  java: 'java',
  kotlin: 'kotlin',
  swift: 'swift',
  ruby: 'ruby',
  php: 'php',
  graphql: 'graphql',
  plaintext: 'plaintext',
  text: 'plaintext',
};

function resolveLanguage(language: string): string | null {
  const lower = language.toLowerCase();
  const mapped = LANGUAGE_ALIASES[lower] ?? lower;
  if (mapped === 'plaintext') return null;
  return hljs.getLanguage(mapped) ? mapped : null;
}

let cache: { code: string; language: string; html: string } | null = null;

function toHtml(code: string, language: string): string {
  if (cache && cache.code === code && cache.language === language) {
    return cache.html;
  }

  let html: string;
  const resolved = resolveLanguage(language);
  try {
    if (resolved) {
      html = hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value;
    } else {
      // Unknown/plaintext: still escape so the <pre> renders raw text safely.
      html = escapeHtml(code);
    }
  } catch {
    html = escapeHtml(code);
  }

  cache = { code, language, html };
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlight(code: string, language: string): ReactNode {
  return createElement('span', {
    className: 'hljs',
    dangerouslySetInnerHTML: { __html: toHtml(code, language) },
  });
}
