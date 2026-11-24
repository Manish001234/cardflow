const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/app/api/ocr/gemini/route.ts'), 'utf8');

test('retains authenticated server-side Gemini endpoint and quota', () => {
  assert.match(source, /validOrigin\(request\)/);
  assert.match(source, /getViewer\(\)/);
  assert.match(source, /reserveScan\(viewer\.id\)/);
});
test('uses server-side key and never client prefix', () => {
  assert.match(source, /process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_GEMINI/);
});
test('retry is bounded and only transient failures get repeated', () => {
  assert.match(source, /attempt <= 2/);
  assert.match(source, /\[500, 502, 503, 504\]\.includes\(response\.status\)/);
  assert.match(source, /if \(!transient\) break/);
});
test('fallback model must be explicitly configured', () => {
  assert.match(source, /process\.env\.GEMINI_FALLBACK_MODEL\?\.trim\(\)/);
  assert.match(source, /if \(fallback && fallback !== model\)/);
});
test('maintains JSON response schema and image payload', () => {
  assert.match(source, /responseMimeType: 'application\/json'/);
  assert.match(source, /inlineData: image/);
  assert.match(source, /cardSchema\.parse/);
});
