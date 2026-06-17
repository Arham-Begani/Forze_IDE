import { createElement, type ReactNode } from 'react';
// Use the highlight.js CORE build and register only the grammars we actually
// map below, instead of `import hljs from 'highlight.js'` which pulls the full
// ~190-language, ~900KB bundle into the boot chunk. These ~25 cover every id in
// LANGUAGE_ALIASES, so no supported language is lost — but boot parses far less.
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import less from 'highlight.js/lib/languages/less';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

/**
 * Syntax highlighting for the code editor overlay, powered by highlight.js.
 * highlight.js escapes the source and wraps tokens in `<span class="hljs-…">`
 * while preserving every character and newline exactly — which is what keeps the
 * highlighted <pre> aligned, char-for-char, with the transparent <textarea>
 * layered on top of it. Token colours live in the `.hljs-*` rules in index.css.
 *
 * We render the resulting HTML with dangerouslySetInnerHTML. This is safe: the
 * input is the user's own file, highlight.js HTML-escapes all of it, and the
 * output is markup we generated (never executed as script).
 */

// Register the grammars once at module load. Keep this list in sync with the
// distinct values in LANGUAGE_ALIASES below.
for (const [name, lang] of Object.entries({
  bash, c, cpp, csharp, css, dockerfile, go, graphql, ini, java, javascript,
  json, kotlin, less, markdown, php, python, ruby, rust, scss, sql, swift,
  typescript, xml, yaml,
})) {
  hljs.registerLanguage(name, lang);
}

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
