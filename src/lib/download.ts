/** Trigger a browser download for in-memory text (CSV, JSON, Markdown). Nothing is uploaded anywhere. */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  // A BOM makes Excel open UTF-8 CSVs (emoji, accents) correctly.
  const body = mime.startsWith('text/csv') ? `﻿${content}` : content;
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
