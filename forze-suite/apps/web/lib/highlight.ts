type Token = { text: string; cls?: string };

const TS_KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'default',
  'function',
  'const',
  'let',
  'var',
  'return',
  'if',
  'else',
  'for',
  'while',
  'in',
  'of',
  'class',
  'new',
  'this',
  'async',
  'await',
  'type',
  'interface',
  'extends',
  'implements',
  'public',
  'private',
  'protected',
  'static',
  'readonly',
  'true',
  'false',
  'null',
  'undefined',
  'as',
  'enum',
  'switch',
  'case',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'void',
  'never',
  'any',
  'string',
  'number',
  'boolean',
  'do',
  'typeof',
  'instanceof',
]);

const PRISMA_KEYWORDS = new Set([
  'model',
  'generator',
  'datasource',
  'enum',
  'String',
  'Int',
  'Float',
  'Boolean',
  'DateTime',
  'Json',
  'Bytes',
]);

const JSON_KEYWORDS = new Set(['true', 'false', 'null']);

function tokenizeLine(line: string, lang: string): Token[] {
  if (lang === 'env' || lang === 'gitignore') {
    if (line.trim().startsWith('#')) return [{ text: line, cls: 'tok-com' }];
    const eq = line.indexOf('=');
    if (eq > -1) {
      return [
        { text: line.slice(0, eq), cls: 'tok-key' },
        { text: '=', cls: 'tok-punct' },
        { text: line.slice(eq + 1), cls: 'tok-str' },
      ];
    }
    return [{ text: line }];
  }

  const tokens: Token[] = [];
  const keywords = lang === 'prisma' ? PRISMA_KEYWORDS : lang === 'json' ? JSON_KEYWORDS : TS_KEYWORDS;
  // Strip line comments first
  const commentIdx = lang !== 'json' ? line.indexOf('//') : -1;
  let activeLine = line;
  let trailingComment = '';
  if (commentIdx !== -1 && !insideString(line, commentIdx)) {
    activeLine = line.slice(0, commentIdx);
    trailingComment = line.slice(commentIdx);
  }

  const regex =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\*[\s\S]*?\*\/|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][\w$]*\b|<\/?[A-Za-z][\w-]*|[{}[\]();,.<>=+\-*/!?:&|^%]+|\s+)/g;

  let m: RegExpExecArray | null;
  let lastIndex = 0;
  while ((m = regex.exec(activeLine)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ text: activeLine.slice(lastIndex, m.index) });
    }
    const t = m[0];
    if (/^\s+$/.test(t)) {
      tokens.push({ text: t });
    } else if (/^["'`]/.test(t)) {
      tokens.push({ text: t, cls: 'tok-str' });
    } else if (/^\/\*/.test(t)) {
      tokens.push({ text: t, cls: 'tok-com' });
    } else if (/^\d/.test(t)) {
      tokens.push({ text: t, cls: 'tok-num' });
    } else if (/^<\/?[A-Za-z]/.test(t)) {
      tokens.push({ text: t, cls: 'tok-jsx' });
    } else if (/^[A-Za-z_]/.test(t)) {
      if (keywords.has(t)) {
        tokens.push({ text: t, cls: 'tok-key' });
      } else if (/^[A-Z]/.test(t)) {
        tokens.push({ text: t, cls: 'tok-type' });
      } else {
        tokens.push({ text: t });
      }
    } else {
      tokens.push({ text: t, cls: 'tok-punct' });
    }
    lastIndex = m.index + t.length;
  }
  if (lastIndex < activeLine.length) {
    tokens.push({ text: activeLine.slice(lastIndex) });
  }
  if (trailingComment) {
    tokens.push({ text: trailingComment, cls: 'tok-com' });
  }
  return tokens;
}

function insideString(line: string, idx: number): boolean {
  let inS = false;
  let q = '';
  for (let i = 0; i < idx; i++) {
    const ch = line[i];
    if (inS) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === q) inS = false;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inS = true;
      q = ch;
    }
  }
  return inS;
}

export function highlightLines(text: string, language: string): Token[][] {
  return text.split('\n').map((l) => tokenizeLine(l, language));
}
