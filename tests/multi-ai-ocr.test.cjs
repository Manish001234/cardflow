const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = rel => fs.readFileSync(path.resolve(__dirname, '../src', rel), 'utf8');
test('local OCR does not request paid inference endpoint', () => {
  const page = source('app/page.tsx');
  assert.match(page, /extractBrowserCard\(prepared.upload, preparedBack\?\.upload\)/);
  assert.doesNotMatch(page, /fetch\('\/api\/extract-card'/);
});
test('local OCR preserves processing queue and retry behavior', () => {
  const page = source('app/page.tsx');
  assert.match(page, /retryFiles\.current\.set\(id, \{ file, back \}\)/);
  assert.match(page, /const retryFailed = \(id: number\)/);
  assert.match(page, /pending\.current\.push\(\{ id, \.\.\.original \}\)/);
});
test('server-side paid OCR endpoint disabled', () => {
  assert.match(source('app/api/extract-card/route.ts'), /status: 410/);
  assert.match(source('lib/browser-ocr.ts'), /@paddleocr\/paddleocr-js/);
});
