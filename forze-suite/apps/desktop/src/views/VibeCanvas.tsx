import { useCallback, useState } from 'react';
import { GeminiProvider } from '@forze/agents';
import { useAgents } from '../workbench/agentStore';
import { resolveApiKey } from '../workbench/aiConfig';
import { useWorkbench } from '../workbench/store';

interface VibeCanvasProps {
  onInsertCode: (snippet: string) => void;
}

interface SketchPayload {
  fileName: string;
  size: number;
  dataUrl: string;
}

/**
 * Drag-and-drop a mockup image; the IDE sends it to Gemini's vision model and
 * pipes the generated Tailwind JSX into the active editor buffer at the cursor.
 * Uses the built-in Gemini key (or the user's own) via the shared key resolver,
 * so it works out of the box. Falls back to a deterministic snippet only if the
 * model returns nothing usable.
 */
export default function VibeCanvas({ onInsertCode }: VibeCanvasProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const [sketch, setSketch] = useState<SketchPayload | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const apiKeys = useAgents((s) => s.apiKeys);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);

  const onDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) {
      setLastError('Drop an image file (PNG, JPG, SVG, or WebP).');
      return;
    }
    const dataUrl = await readAsDataUrl(file);
    setSketch({ fileName: file.name, size: file.size, dataUrl });
    setLastError(null);
  }, []);

  const generate = useCallback(async () => {
    if (!sketch) return;
    const key = resolveApiKey(GeminiProvider.id, apiKeys);
    if (!key) {
      setLastError(
        'No Gemini key available. Add one in Settings → Agent providers.',
      );
      setActiveActivity('settings');
      return;
    }

    const parsed = splitDataUrl(sketch.dataUrl);
    if (!parsed) {
      setLastError('Could not read the dropped image.');
      return;
    }

    setIsGenerating(true);
    setLastError(null);
    try {
      const raw = await GeminiProvider.generateVision({
        apiKey: key,
        prompt: VISION_PROMPT,
        imageBase64: parsed.base64,
        mimeType: parsed.mimeType,
        maxTokens: 4096,
      });
      const snippet = stripCodeFences(raw) || buildPlaceholderSnippet(sketch.fileName);
      onInsertCode(snippet);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  }, [apiKeys, onInsertCode, setActiveActivity, sketch]);

  return (
    <section className="panel">
      <h2>Vibe Canvas</h2>
      <p className="muted">
        Drop a mockup or sketch. The vision pipeline returns Tailwind JSX and
        inserts it at the cursor in your active editor tab.
      </p>

      <div
        className={`dropzone ${isDragging ? 'is-active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        {sketch ? (
          <div>
            <img
              src={sketch.dataUrl}
              alt={sketch.fileName}
              style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: 8 }}
            />
            <div style={{ marginTop: 12 }}>
              <strong>{sketch.fileName}</strong>{' '}
              <span className="muted">({Math.round(sketch.size / 1024)} KB)</span>
            </div>
          </div>
        ) : (
          <span>Drop a mockup image here to translate it into a layout.</span>
        )}
      </div>

      {lastError && <p style={{ color: 'var(--color-danger)' }}>{lastError}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={generate} disabled={!sketch || isGenerating}>
          {isGenerating ? 'Generating…' : 'Generate & insert at cursor'}
        </button>
        <button
          type="button"
          onClick={() => {
            setSketch(null);
            setLastError(null);
          }}
          disabled={!sketch || isGenerating}
        >
          Clear
        </button>
      </div>
    </section>
  );
}

const VISION_PROMPT = [
  'You are a senior frontend engineer. Convert this UI mockup into a single,',
  'self-contained React + Tailwind CSS JSX snippet. Use semantic HTML and',
  'sensible Tailwind classes that match the layout, spacing, and hierarchy in',
  'the image. Return ONLY the JSX — no imports, no component wrapper, no',
  'explanation, no markdown fences. The snippet will be pasted directly into an',
  'existing component at the cursor.',
].join(' ');

/** Split a `data:<mime>;base64,<data>` URL into its parts. */
function splitDataUrl(
  dataUrl: string,
): { mimeType: string; base64: string } | null {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1]!, base64: match[2]! };
}

/** Strip a leading/trailing ```lang … ``` fence the model may add despite instructions. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(trimmed);
  return (fence ? fence[1]! : trimmed).trim();
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

function buildPlaceholderSnippet(fileName: string): string {
  return `
{/* generated by Vibe Canvas from ${fileName} */}
<section className="mx-auto max-w-3xl px-6 py-12">
  <h1 className="text-3xl font-semibold tracking-tight">Untitled Hero</h1>
  <p className="mt-3 text-base text-zinc-400">
    Replace this copy with the message you sketched out.
  </p>
  <div className="mt-6 flex gap-3">
    <button className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white">
      Primary CTA
    </button>
    <button className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200">
      Secondary
    </button>
  </div>
</section>
`.trim();
}
