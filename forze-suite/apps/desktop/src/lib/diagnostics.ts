import * as monaco from 'monaco-editor';
import type { StackTraceLine } from '@forze/shared/diagnostics';

/**
 * Attach interactive Monaco markers for diagnostic frames streamed from the
 * Tauri sidecar. Lines are accumulated under the `forze-compiler` owner so
 * the caller can clear them with a single `setModelMarkers([])` call.
 */
export function attachDiagnosticsToEditor(
  editor: monaco.editor.IStandaloneCodeEditor,
  trace: StackTraceLine,
): void {
  const model = editor.getModel();
  if (!model) return;

  const existing = monaco.editor
    .getModelMarkers({ owner: 'forze-compiler', resource: model.uri })
    .map((marker) => ({
      severity: marker.severity,
      message: marker.message,
      startLineNumber: marker.startLineNumber,
      startColumn: marker.startColumn,
      endLineNumber: marker.endLineNumber,
      endColumn: marker.endColumn,
    } satisfies monaco.editor.IMarkerData));

  const next: monaco.editor.IMarkerData = {
    severity:
      trace.severity === 'error'
        ? monaco.MarkerSeverity.Error
        : trace.severity === 'warning'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
    message: `${trace.message} — Click to ask the Forze Repair Agent`,
    startLineNumber: trace.line,
    startColumn: trace.column,
    endLineNumber: trace.line,
    endColumn: trace.column + 5,
  };

  monaco.editor.setModelMarkers(model, 'forze-compiler', [...existing, next]);
}

export function clearDiagnostics(
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  const model = editor.getModel();
  if (!model) return;
  monaco.editor.setModelMarkers(model, 'forze-compiler', []);
}
