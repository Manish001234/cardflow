const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const route = fs.readFileSync(path.join(__dirname, '../src/app/api/ocr/gemini/route.ts'), 'utf8');

test('preserves Gemini auth, origin, image constraints and scan quota', () => {
  for (const token of ['getViewer()', 'validOrigin(request)', 'validateImages(', 'reserveScan(viewer.id)', 'releaseScan(reservation)', 'responseSchema:', 'cardSchema.parse']) assert.ok(route.includes(token), token);
});
test('maps upstream key and permission errors distinctly', () => {
  assert.match(route, /httpStatus === 401/);
  assert.match(route, /httpStatus === 403/);
  assert.match(route, /category: 'authentication'/);
  assert.match(route, /category: 'permission_or_billing'/);
});
test('maps invalid model, quota, bad inputs, and upstream outages', () => {
  for (const token of ['httpStatus === 404', 'httpStatus === 429', 'httpStatus === 400', 'httpStatus === 503', "category: 'model_unavailable'", "category: 'quota'"]) assert.ok(route.includes(token), token);
});
test('does not log upstream bodies, image data or credentials', () => {
  assert.match(route, /await upstreamErrorCode\(response\)/);
  assert.match(route, /logGeminiDiagnostic\(failure.category, response.status, providerCode\)/);
  assert.doesNotMatch(route, /console\.(log|info|debug)\(/);
  assert.match(route, /console\.error\('\[CardFlow Gemini\]'\,/);
});
test('still keeps API key on server and never saves contacts', () => {
  assert.match(route, /process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(route, /collection\('contacts'\)|uploadOriginals/);
});
