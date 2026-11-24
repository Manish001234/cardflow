const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(base, p), 'utf8');
const page = read('src/app/page.tsx');
const route = read('src/app/api/ocr/gemini/route.ts');
const client = read('src/lib/gemini-client.ts');

test('Free OCR is the default and Gemini must be explicitly selected', () => {
  assert.match(page, /useState<ScanProvider>\('free'\)/);
  assert.match(page, /checked=\{scanProvider === 'free'\}/);
  assert.match(page, /checked=\{scanProvider === 'gemini'\}/);
  assert.match(page, /provider === 'gemini'[\s\S]*?extractGeminiCard\([\s\S]*?: await extractBrowserCard\(/);
});
test('queued scans and retries preserve the provider selected when enqueued', () => {
  assert.match(page, /pending\.current\.shift\(\)!/);
  assert.match(page, /retryFiles\.current\.set\(id, \{ file, back, provider \}\)/);
  assert.match(page, /pending\.current\.push\(\{ id, \.\.\.original \}\)/);
  assert.match(page, /pending\.current\.push\(\{ id, file: front, back, provider: scanProvider \}\)/);
  assert.match(page, /newJobs\.map\(\(\{ id, file \}\) => \(\{ id, file, provider: scanProvider \}\)\)/);
});
test('Gemini API key never reaches browser and free OCR remains separate', () => {
  assert.doesNotMatch(client, /GEMINI_API_KEY|NEXT_PUBLIC_/);
  assert.doesNotMatch(page, /GEMINI_API_KEY|NEXT_PUBLIC_/);
  assert.match(route, /process\.env\.GEMINI_API_KEY/);
  assert.match(client, /fetch\('\/api\/ocr\/gemini'/);
  assert.match(route, /getViewer\(\)/);
  assert.match(route, /validOrigin\(request\)/);
});
test('Gemini endpoint validates images, limits usage and does not save contacts automatically', () => {
  assert.match(route, /images\.length > 2/);
  assert.match(route, /IMAGE_TYPES/);
  assert.match(route, /GEMINI_MONTHLY_SCAN_LIMIT/);
  assert.match(route, /findOneAndUpdate/);
  assert.match(route, /responseSchema:/);
  assert.match(route, /cardSchema\.parse/);
  assert.doesNotMatch(route, /uploadOriginals|collection\('contacts'\)|\$set: \{ cards/);
  assert.match(page, /setScanDrafts\(previous =>/);
});
test('Gemini failures surface to the user without automatic paid retries or fallback', () => {
  assert.match(client, /if \(!response\.ok\)/);
  assert.match(client, /throw new Error\(message\)/);
  assert.match(client, /controller\.abort\(\)/);
  assert.doesNotMatch(client, /extractBrowserCard\(/);
  assert.doesNotMatch(route, /console\.(log|info|debug)/);
});
