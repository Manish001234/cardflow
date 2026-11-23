import type { StoredCard } from '@/types/card';
import { addTags } from './contact-management';

export interface ImportResult { contacts: StoredCard[]; skipped: number; }
const MAX_BYTES = 5 * 1024 * 1024;
type Column = 'fullName' | 'jobTitle' | 'companyName' | 'email' | 'phone' | 'website' | 'address' | 'notes' | 'confidenceScore' | 'tags' | 'favorite';
const aliases: Record<string, Column> = {
  fullname:'fullName', name:'fullName', contactname:'fullName',
  jobtitle:'jobTitle', title:'jobTitle', designation:'jobTitle',
  companyname:'companyName', company:'companyName', organization:'companyName', organisation:'companyName',
  email:'email', emailaddress:'email', emails:'email', phone:'phone', phonenumber:'phone', mobile:'phone', mobilephone:'phone', telephone:'phone',
  website:'website', url:'website', address:'address', notes:'notes', note:'notes',
  confidencescore:'confidenceScore', confidence:'confidenceScore', tags:'tags', tag:'tags', favorite:'favorite', favourite:'favorite',
};
function headerKey(value: string): Column | undefined { return aliases[value.toLowerCase().replace(/[^a-z]/g, '')]; }
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  const data = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    if (quoted) {
      if (ch === '"' && data[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') { if (cell.trim()) throw new Error('Invalid CSV quote sequence.'); quoted = true; }
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && data[i+1] === '\n') i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (row.length || cell) { row.push(cell); if (row.some(v => v.trim())) rows.push(row); }
  return rows;
}
function mapRows(rows: string[][], source: string): ImportResult {
  if (rows.length < 2) throw new Error('File must contain a header and at least one contact row.');
  if (rows.length > 5001) throw new Error('Import is limited to 5,000 contacts per file.');
  const headers = rows[0].map(headerKey);
  if (!headers.some(key => key === 'fullName' || key === 'email' || key === 'phone' || key === 'companyName')) throw new Error('No recognized contact columns. Use Full Name, Email, Phone, or Company Name.');
  const now = new Date().toISOString(); const contacts: StoredCard[] = []; let skipped = 0;
  for (const cells of rows.slice(1)) {
    const data: Partial<Record<Column, string>> = {};
    headers.forEach((key, index) => { if (key && !(key in data)) data[key] = (cells[index] ?? '').trim().slice(0, 5000); });
    if (!['fullName', 'email', 'phone', 'companyName'].some(key => (data[key as Column] ?? '').trim())) { skipped++; continue; }
    const value = (key: Column) => data[key] ?? '';
    const score = value('confidenceScore');
    const result: StoredCard = {
      id: crypto.randomUUID(), fullName: value('fullName'), jobTitle: value('jobTitle'), companyName: value('companyName'),
      email: value('email'), phone: value('phone'), website: value('website'), address: value('address'), notes: value('notes'),
      confidenceScore: score === 'High' || score === 'Medium' || score === 'Low' ? score : 'Low',
      preview: '', sourceName: source, createdAt: now,
      favorite: /^(yes|true|1)$/i.test(value('favorite')),
    };
    contacts.push(addTags(result, value('tags').split(/[;|]/)));
  }
  return { contacts, skipped };
}
export function importCsvText(text: string, name = 'contacts.csv'): ImportResult { return mapRows(parseCsv(text), name); }
export async function importContactsFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_BYTES) throw new Error('Maximum import size is 5 MB.');
  const ext = file.name.split('.').at(-1)?.toLowerCase();
  if (ext === 'csv') return importCsvText(await file.text(), file.name);
  if (ext === 'xlsx') {
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(await file.arrayBuffer()) as never);
    const sheet = book.worksheets[0];
    if (!sheet) throw new Error('Workbook does not contain a worksheet.');
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, row => {
      if (rows.length > 5001) return;
      const entries = Array.from({ length: row.cellCount }, (_, i) => {
        const val = row.getCell(i+1).value;
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
          if ('text' in val && typeof val.text === 'string') return val.text;
          if ('result' in val && (typeof val.result === 'string' || typeof val.result === 'number')) return String(val.result);
          return '';
        }
        return String(val);
      });
      rows.push(entries);
    });
    return mapRows(rows, file.name);
  }
  throw new Error('Choose a .csv or .xlsx file.');
}
