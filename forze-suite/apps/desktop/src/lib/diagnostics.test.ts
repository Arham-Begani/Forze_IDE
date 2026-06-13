import { describe, it, expect } from 'vitest';
import { parseStackTraceLine } from '@forze/shared/diagnostics';

describe('parseStackTraceLine', () => {
  it('parses a Vite/Next-style frame with file, line and column', () => {
    const out = parseStackTraceLine('at src/app/page.tsx:42:7');
    expect(out).not.toBeNull();
    expect(out).toMatchObject({ filePath: 'src/app/page.tsx', line: 42, column: 7 });
  });

  it('works without the leading "at"', () => {
    const out = parseStackTraceLine('components/Button.jsx:10:3 is broken');
    expect(out).toMatchObject({ filePath: 'components/Button.jsx', line: 10, column: 3 });
  });

  it('returns null for lines with no stack frame', () => {
    expect(parseStackTraceLine('Compiled successfully in 320ms')).toBeNull();
  });

  it('classifies severity from the message text', () => {
    expect(parseStackTraceLine('Error in src/x.ts:1:1')?.severity).toBe('error');
    expect(parseStackTraceLine('Warning at src/x.ts:1:1')?.severity).toBe('warning');
    expect(parseStackTraceLine('note src/x.ts:1:1 here')?.severity).toBe('info');
  });

  it('captures the whole raw line as the message', () => {
    const raw = '  at src/main.ts:5:9  ';
    expect(parseStackTraceLine(raw)?.message).toBe('at src/main.ts:5:9');
  });
});
