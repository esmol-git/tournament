import { csvRow, parseCsv } from '../players/players-csv.util';
import * as XLSX from 'xlsx';

export const ROSTER_CSV_HEADERS = [
  'lastName',
  'firstName',
  'birthDate',
  'jerseyNumber',
  'position',
] as const;

export type ParsedRosterCsvRow = {
  rowNumber: number
  lastName: string
  firstName: string
  birthDate: Date | null
  jerseyNumber: number | null
  position: string | null
};

export function buildRosterTemplateCsv(): string {
  const lines = [
    csvRow([...ROSTER_CSV_HEADERS]),
    csvRow(['Иванов', 'Пётр', '2014-05-12', '10', '']),
    csvRow(['Петров', 'Иван', '15.03.2014', '7', 'вратарь']),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function normalizeHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function findCol(headers: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = headers.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

export function parseBirthDate(raw: string): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (ru) {
    const d = new Date(Date.UTC(+ru[3], +ru[2] - 1, +ru[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function sameUtcDate(a: Date | null, b: Date | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function parseRosterCsv(content: string): ParsedRosterCsvRow[] {
  const rows = parseCsv(content.trim());
  if (rows.length < 2) {
    throw new Error('CSV: нужна строка заголовков и хотя бы одна строка данных');
  }
  const headers = rows[0].map(normalizeHeader);
  const lastIdx = findCol(headers, [
    'lastname',
    'last_name',
    'фамилия',
    'фам',
  ]);
  const firstIdx = findCol(headers, [
    'firstname',
    'first_name',
    'имя',
  ]);
  if (lastIdx < 0 || firstIdx < 0) {
    throw new Error(
      'CSV: нужны колонки lastName/фамилия и firstName/имя',
    );
  }
  const birthIdx = findCol(headers, [
    'birthdate',
    'birth_date',
    'дата_рождения',
    'др',
  ]);
  const numberIdx = findCol(headers, [
    'jerseynumber',
    'jersey_number',
    'number',
    'номер',
    '№',
  ]);
  const posIdx = findCol(headers, ['position', 'позиция', 'амплуа']);

  const out: ParsedRosterCsvRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const lastName = String(row[lastIdx] ?? '').trim();
    const firstName = String(row[firstIdx] ?? '').trim();
    if (!lastName && !firstName) continue;
    if (!lastName || !firstName) {
      throw new Error(`Строка ${i + 1}: укажите фамилию и имя`);
    }
    const birthRaw = birthIdx >= 0 ? String(row[birthIdx] ?? '').trim() : '';
    const birthDate = birthRaw ? parseBirthDate(birthRaw) : null;
    if (birthRaw && !birthDate) {
      throw new Error(`Строка ${i + 1}: неверная дата рождения`);
    }
    let jerseyNumber: number | null = null;
    if (numberIdx >= 0) {
      const nRaw = String(row[numberIdx] ?? '').trim();
      if (nRaw) {
        const n = Number.parseInt(nRaw, 10);
        if (!Number.isInteger(n) || n < 1 || n > 99) {
          throw new Error(`Строка ${i + 1}: номер должен быть от 1 до 99`);
        }
        jerseyNumber = n;
      }
    }
    const position =
      posIdx >= 0 ? String(row[posIdx] ?? '').trim() || null : null;
    out.push({
      rowNumber: i + 1,
      lastName,
      firstName,
      birthDate,
      jerseyNumber,
      position,
    });
  }
  if (!out.length) {
    throw new Error('CSV: нет строк с игроками');
  }
  return out;
}

export function normalizePersonKey(
  lastName: string,
  firstName: string,
  birthDate: Date | null,
): string {
  const ln = lastName.trim().toLowerCase();
  const fn = firstName.trim().toLowerCase();
  const bd = birthDate
    ? `${birthDate.getUTCFullYear()}-${birthDate.getUTCMonth() + 1}-${birthDate.getUTCDate()}`
    : '';
  return `${ln}|${fn}|${bd}`;
}

export { sameUtcDate };

export function parseRosterXlsx(buffer: Buffer): ParsedRosterCsvRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const name = wb.SheetNames[0];
  if (!name) throw new Error('XLSX: нет листов');
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error('XLSX: пустой лист');
  const csv = XLSX.utils.sheet_to_csv(sheet);
  return parseRosterCsv(csv);
}
