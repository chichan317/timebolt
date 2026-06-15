/** Escape one CSV field per RFC 4180. */
function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Rows -> CSV text with CRLF line endings. */
export function buildCsv(rows: (string | number | boolean)[][]): string {
  return rows.map((row) => row.map((cell) => escapeField(String(cell))).join(',')).join('\r\n');
}

/** Trigger a browser download of generated content. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
