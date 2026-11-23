import type { StoredCard } from '@/types/card';

const HEADERS: Array<[keyof StoredCard, string]> = [
  ['fullName', 'Full Name'], ['jobTitle', 'Job Title'], ['companyName', 'Company Name'],
  ['email', 'Email'], ['phone', 'Phone'], ['website', 'Website'],
  ['address', 'Address'], ['notes', 'Notes'], ['confidenceScore', 'Confidence Score'],
  ['tags', 'Tags'], ['favorite', 'Favorite'],
];

/** Avoid formula injection when a downloaded CSV/XLSX is opened in a spreadsheet. */
function safeCell(text: string): string {
  return /^[\s\u0000-\u001f]*[=+@\-]/u.test(text) ? `'${text}` : text;
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
const fileName = (ext: string) => `business-cards-${new Date().toISOString().slice(0, 10)}.${ext}`;

export function exportCsv(cards: StoredCard[]) {
  const lines = [HEADERS.map(([, name]) => name), ...cards.map(card => HEADERS.map(([key]) => safeCell(key === 'tags' ? (card.tags ?? []).join('; ') : key === 'favorite' ? card.favorite ? 'Yes' : 'No' : String(card[key]))))];
  const csv = lines.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), fileName('csv'));
}

export async function exportExcel(cards: StoredCard[]) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Visiting Card OCR';
  const sheet = workbook.addWorksheet('Contacts', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = HEADERS.map(([key, header]) => ({ header, key, width: 18 }));
  cards.forEach(card => {
    const row = Object.fromEntries(HEADERS.map(([key]) => [key, safeCell(key === 'tags' ? (card.tags ?? []).join('; ') : key === 'favorite' ? card.favorite ? 'Yes' : 'No' : String(card[key]))]));
    sheet.addRow(row);
  });
  const heading = sheet.getRow(1);
  heading.height = 28;
  heading.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172238' } };
    cell.alignment = { vertical: 'middle' };
  });
  sheet.autoFilter = { from: 'A1', to: `K${Math.max(1, cards.length + 1)}` };
  sheet.columns.forEach(column => {
    const strings = [column.header ?? '', ...cards.map(card => column.key === 'tags' ? (card.tags ?? []).join('; ') : column.key === 'favorite' ? card.favorite ? 'Yes' : 'No' : String(card[column.key as keyof StoredCard] ?? ''))];
    column.width = Math.min(58, Math.max(15, ...strings.map(value => value.length + 3)));
  });
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    row.height = 21;
    row.eachCell(cell => {
      cell.alignment = { vertical: 'middle' };
      if (index % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FB' } };
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  download(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName('xlsx'));
}
