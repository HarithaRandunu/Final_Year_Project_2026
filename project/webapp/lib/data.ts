import fs from "node:fs";

export type CsvRow = Record<string, string | number>;

/** Reads and parses a JSON file, returning null if it does not exist. */
export function readJson<T = unknown>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

/**
 * Minimal CSV parser for the project's own flat, numeric trial-level tables
 * (results/phase7/trial_level_data.csv and results_v2's equivalent) - no
 * quoted-field or embedded-comma handling, since that data never needs it.
 * Returns an array of row objects keyed by the header line, with values
 * coerced to numbers where they parse cleanly.
 */
export function readCsv(filePath: string): CsvRow[] | null {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, "utf-8").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      const cell = (cells[i] || "").trim();
      const num = Number(cell);
      row[h] = cell !== "" && !Number.isNaN(num) ? num : cell;
    });
    return row;
  });
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}
