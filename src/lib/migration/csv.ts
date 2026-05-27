// Robust CSV parse/serialize used across the import/migration engine.
// Handles quoted fields, embedded commas/newlines, and escaped quotes ("").

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const matrix = splitCsvRows(text);
  if (matrix.length === 0) return { headers: [], rows: [], rawRows: [] };
  const headers = matrix[0].map((h) => h.trim());
  const rawRows = matrix.slice(1);
  const rows = rawRows.map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows, rawRows };
}

export function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let rowHasContent = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      if (field !== "") rowHasContent = true;
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (field !== "") rowHasContent = true;
      if (rowHasContent) rows.push(row);
      row = [];
      field = "";
      rowHasContent = false;
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (field !== "") rowHasContent = true;
    if (rowHasContent) rows.push(row);
  }
  return rows;
}

export function csvCell(v: string | null | undefined): string {
  const s = v ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Array<Record<string, string>>): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvCell(r[h])).join(","));
  }
  return lines.join("\n");
}
