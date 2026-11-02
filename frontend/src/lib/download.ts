/** Lets the user save generated data as a file (CSV or JSON). */
export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Rows to CSV, quoting every value so commas and line breaks in notes are safe. */
export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(quote).join(",")).join("\r\n");
}
