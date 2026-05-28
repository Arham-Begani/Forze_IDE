import { Editor, type OnMount } from '@monaco-editor/react';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import * as monaco from 'monaco-editor';
import { attachDiagnosticsToEditor, clearDiagnostics } from '../lib/diagnostics';
import type { StackTraceLine } from '@forze/shared/diagnostics';

export interface EditorHandle {
  insertAtCursor: (snippet: string) => void;
  markDiagnostic: (trace: StackTraceLine) => void;
  clearDiagnostics: () => void;
  getValue: () => string;
}

interface EditorCanvasProps {
  initialValue?: string;
  language?: string;
  onChange?: (value: string) => void;
}

// Custom Monaco theme: matches the Forze Noir palette so the editor blends
// seamlessly with the rest of the IDE chrome.
function defineForzeTheme(): void {
  monaco.editor.defineTheme('forze-noir', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'ededf2', background: '0a0a0c' },
      { token: 'comment', foreground: '5a5d68', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'd2a8ff' },
      { token: 'keyword.control', foreground: 'ff7ab6' },
      { token: 'string', foreground: '7ee787' },
      { token: 'number', foreground: 'ff9090' },
      { token: 'type', foreground: '79c0ff' },
      { token: 'identifier', foreground: 'ededf2' },
      { token: 'delimiter', foreground: 'b4b4c0' },
      { token: 'tag', foreground: '79c0ff' },
      { token: 'attribute.name', foreground: 'ffd866' },
      { token: 'attribute.value', foreground: '7ee787' },
      { token: 'variable', foreground: 'ededf2' },
      { token: 'function', foreground: '9cdcfe' },
    ],
    colors: {
      'editor.background': '#0a0a0c',
      'editor.foreground': '#ededf2',
      'editor.lineHighlightBackground': '#101013',
      'editor.lineHighlightBorder': '#101013',
      'editorLineNumber.foreground': '#3a3a45',
      'editorLineNumber.activeForeground': '#8b7cff',
      'editorCursor.foreground': '#a78bfa',
      'editor.selectionBackground': '#3a2f6a',
      'editor.selectionHighlightBackground': '#221b40',
      'editorIndentGuide.background': '#1d1d24',
      'editorIndentGuide.activeBackground': '#2a2a34',
      'editorWhitespace.foreground': '#1d1d24',
      'editorGutter.background': '#0a0a0c',
      'editor.wordHighlightBackground': '#2a2a34',
      'editorBracketMatch.background': '#3a2f6a',
      'editorBracketMatch.border': '#8b7cff',
      'scrollbarSlider.background': '#1d1d2480',
      'scrollbarSlider.hoverBackground': '#2a2a34cc',
      'scrollbarSlider.activeBackground': '#2a2a34',
      'editorSuggestWidget.background': '#131318',
      'editorSuggestWidget.border': '#1d1d24',
      'editorSuggestWidget.selectedBackground': '#1a1a20',
      'editorWidget.background': '#131318',
      'editorWidget.border': '#1d1d24',
    },
  });
}

let themeDefined = false;

const EditorCanvas = forwardRef<EditorHandle, EditorCanvasProps>(
  function EditorCanvas({ initialValue = '', language = 'typescript', onChange }, ref) {
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    const handleMount: OnMount = useCallback((editor, monacoInstance) => {
      editorRef.current = editor;
      if (!themeDefined) {
        defineForzeTheme();
        themeDefined = true;
      }
      monacoInstance.editor.setTheme('forze-noir');
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor: (snippet: string) => {
          const editor = editorRef.current;
          if (!editor) return;
          const range = editor.getSelection() ?? new monaco.Range(1, 1, 1, 1);
          editor.executeEdits('forze-vibe-canvas', [
            { range, text: snippet, forceMoveMarkers: true },
          ]);
          editor.focus();
        },
        markDiagnostic: (trace) => {
          const editor = editorRef.current;
          if (editor) attachDiagnosticsToEditor(editor, trace);
        },
        clearDiagnostics: () => {
          const editor = editorRef.current;
          if (editor) clearDiagnostics(editor);
        },
        getValue: () => editorRef.current?.getValue() ?? '',
      }),
      [],
    );

    return (
      <div style={{ flex: 1, minHeight: 0, background: 'var(--color-editor-bg)' }}>
        <Editor
          height="100%"
          defaultLanguage={language}
          defaultValue={initialValue}
          theme="forze-noir"
          onMount={handleMount}
          onChange={(value) => onChange?.(value ?? '')}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Consolas, monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            tabSize: 2,
            automaticLayout: true,
            renderWhitespace: 'selection',
            wordWrap: 'on',
            padding: { top: 14, bottom: 14 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            renderLineHighlight: 'all',
            lineNumbersMinChars: 3,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          }}
        />
      </div>
    );
  },
);

export default EditorCanvas;
