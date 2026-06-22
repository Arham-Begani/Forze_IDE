import { useCallback, useRef, useState } from 'react';
import { GeminiProvider } from '@forze/agents';
import { pendoTrack } from '../lib/pendoTrack';
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

/** Gemini's inline image budget is generous, but very large data URLs bloat the
 *  request and slow the round-trip. Keep mockups reasonable. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * Drag, paste, or browse for a mockup image; the IDE sends it to Gemini's vision
 * model and pipes the generated Tailwind JSX into the active editor buffer at
 * the cursor (falling back to the clipboard when no file is open). Uses the
 * built-in Gemini key (or the user's own) via the shared key resolver, so it
 * works out of the box. Falls back to a deterministic snippet only if the model
 * returns nothing usable.
 */
export default function VibeCanvas({ onInsertCode }: VibeCanvasProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const [sketch, setSketch] = useState<SketchPayload | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiKeys = useAgents((s) => s.apiKeys);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);

  const loadImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setLastError('Drop an image file (PNG, JPG, SVG, or WebP).');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setLastError(
        `That image is ${formatBytes(file.size)} — keep it under ` +
          `${formatBytes(MAX_IMAGE_BYTES)} for the vision model.`,
      );
      return;
    }
    const dataUrl = await readAsDataUrl(file);
    setSketch({ fileName: file.name || 'pasted-image.png', size: file.size, dataUrl });
    setLastError(null);
    setStatus(null);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) void loadImageFile(file);
    },
    [loadImageFile],
  );

  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const item = Array.from(event.clipboardData.items).find((i) =>
        i.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) {
        event.preventDefault();
        void loadImageFile(file);
      }
    },
    [loadImageFile],
  );

  const onPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void loadImageFile(file);
      event.target.value = ''; // let the same file be re-picked later
    },
    [loadImageFile],
  );

  const generate = useCallback(async () => {
    if (!sketch) return;
    const key = resolveApiKey(GeminiProvider.id, apiKeys);
    if (!key) {
      setLastError('No Gemini key available. Add one in Settings → Agent providers.');
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
    setStatus(null);
    try {
      const raw = await GeminiProvider.generateVision({
        apiKey: key,
        prompt: VISION_PROMPT,
        imageBase64: parsed.base64,
        mimeType: parsed.mimeType,
        maxTokens: 8192,
      });
      const snippet = stripCodeFences(raw) || buildPlaceholderSnippet(sketch.fileName);
      onInsertCode(snippet);
      const lines = snippet.split('\n').length;
      pendoTrack('vibe_canvas_code_generated', {
        image_file_name: sketch.fileName,
        image_size_bytes: sketch.size,
        image_mime_type: parsed.mimeType,
        generated_lines_count: lines,
      });
      setStatus(`Sent ${lines} line${lines === 1 ? '' : 's'} of JSX to your editor.`);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  }, [apiKeys, onInsertCode, setActiveActivity, sketch]);

  const clear = useCallback(() => {
    setSketch(null);
    setLastError(null);
    setStatus(null);
  }, []);

  return (
    <section className="panel">
      <h2>Vibe Canvas</h2>
      <p className="muted">
        Drop, paste, or browse for a mockup. The vision pipeline returns Tailwind
        JSX and inserts it at the cursor in your active editor tab.
      </p>

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPick} />

      <div
        className={`dropzone ${isDragging ? 'is-active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Drop, paste, or click to choose a mockup image"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onPaste={onPaste}
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
              <span className="muted">({formatBytes(sketch.size)})</span>
            </div>
          </div>
        ) : (
          <span>Drop, paste, or click to choose a mockup image.</span>
        )}
      </div>

      {lastError && <p style={{ color: 'var(--color-danger)' }}>{lastError}</p>}
      {status && !lastError && <p style={{ color: 'var(--color-ok)' }}>{status}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={generate} disabled={!sketch || isGenerating}>
          {isGenerating ? 'Generating…' : 'Generate & insert at cursor'}
        </button>
        <button type="button" onClick={clear} disabled={!sketch || isGenerating}>
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

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
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
