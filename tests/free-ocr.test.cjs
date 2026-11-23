const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function loadParser() {
  const code = ts.transpileModule(read('src/lib/contact-parser.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function('exports', code)(exports); return exports.parseContact;
}
const parse = loadParser();
function lines(text) { return text.split('\n').map(s => ({text:s, score:0.95})); }
test('extracts name, designation, company, email, phone and site', () => {
  const c = parse(lines('Asha Sharma\nSenior Software Engineer\nAcme Technologies Pvt Ltd\nasha@acme.com\n+91 98765 43210\nwww.acme.com'));
  assert.equal(c.fullName,'Asha Sharma'); assert.equal(c.jobTitle,'Senior Software Engineer');
  assert.equal(c.companyName,'Acme Technologies Pvt Ltd'); assert.equal(c.email,'asha@acme.com');
  assert.match(c.phone,/98765/); assert.equal(c.website,'www.acme.com');
  assert.equal(c.confidenceScore,'High');
});
test('missing fields remain empty rather than fabricated', () => {
  const c=parse(lines('www.example.org\ncontact@example.org'));
  assert.equal(c.fullName,''); assert.equal(c.jobTitle,''); assert.equal(c.companyName,'');
  assert.equal(c.email,'contact@example.org'); assert.equal(c.confidenceScore,'Low');
});
test('multiple emails and phones are comma-separated and deduplicated', () => {
  const c=parse(lines('John Doe\nFounder\nExample Labs\njohn@example.com\nJOHN@example.com\ninfo@example.com\n9876543210\n+91 99999 88888'));
  assert.equal(c.email,'john@example.com, info@example.com');
  assert.equal(c.phone.split(', ').length,2);
});
test('confidence decreases for blurry low-confidence OCR tokens', () => {
  const a=parse(lines('Ravi Kumar\nDirector\nExample Solutions\nravi@example.com\n9876543210'));
  const b=parse(lines('Ravi Kumar\nDirector\nExample Solutions\nravi@example.com\n9876543210').map(x=>({...x,score:0.4})));
  assert.equal(a.confidenceScore,'High'); assert.equal(b.confidenceScore,'Low');
});
test('front/back supported, server extraction disabled, no paid provider wiring', () => {
  const app=read('src/app/page.tsx'); const sdk=read('src/lib/browser-ocr.ts');
  const route=read('src/app/api/extract-card/route.ts'); const pkg=read('package.json');
  assert.match(app,/extractBrowserCard\(prepared.upload, preparedBack\?\.upload\)/);
  assert.doesNotMatch(app,/fetch\('\/api\/extract-card'/);
  assert.match(sdk,/@paddleocr\/paddleocr-js/);
  assert.match(sdk,/lang: 'en'/);
  assert.match(route,/status: 410/);
  assert.doesNotMatch(pkg,/@google\/genai/);
  assert.doesNotMatch(app,/ocrMode|Google Gemini only|OpenAI GPT/);
});
