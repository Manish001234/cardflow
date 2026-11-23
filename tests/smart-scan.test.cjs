const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadModule(name) {
  const file = path.resolve(__dirname, '../src/lib', `${name}.ts`);
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = module.paths;
  loaded._compile(output.outputText, file);
  return loaded.exports;
}
const { findDuplicate, mergeCards } = loadModule('duplicates');
const { getReviewHints } = loadModule('scan-quality');
function card(props = {}) {
  return { id: 'A', fullName: 'Priya Menon', jobTitle: 'CEO', companyName: 'Example Labs', email: 'priya@example.com', phone: '+91 98765 43210', website: '', address: '', notes: '', confidenceScore: 'High', preview: '', sourceName: 'scan.jpg', createdAt: '2026-01-01', ...props };
}
test('exact email matching case-insensitively across comma-separated addresses', () => {
  const match = findDuplicate(card({id:'B', email:'other@site.com, PRIYA@EXAMPLE.COM',phone:''}), [card()]);
  assert.equal(match?.strength, 'exact'); assert.equal(match?.reason, 'Matching email address');
});
test('phone matches with international prefix variations', () => {
  assert.equal(findDuplicate(card({id:'B', email:'',phone:'9876543210',fullName:'', companyName:''}), [card()])?.reason, 'Matching phone number');
});
test('same name and company matches without email or phone', () => {
  assert.equal(findDuplicate(card({id:'B', email:'',phone:''}), [card({email:'',phone:''})])?.strength, 'exact');
});
test('similar name and company gets probable not exact', () => {
  const c = card({id:'B', fullName:'Priya K Menon', companyName:'Example Labs India', email:'',phone:''});
  const match = findDuplicate(c,[card({email:'',phone:''})]);
  assert.equal(match?.strength, 'probable');
});
test('name-only contacts are not flagged as duplicates', () => {
  assert.equal(findDuplicate(card({id:'B', email:'', phone:'', companyName:''}),[card({email:'',phone:'',companyName:''})]), null);
});
test('shared short phone fragments are not accepted as duplicates', () => {
  assert.equal(findDuplicate(card({id:'B',fullName:'',companyName:'',email:'',phone:'1234'}),[card({fullName:'',companyName:'',email:'',phone:'1234'})]),null);
});
test('unrelated records are not flagged', () => {
  assert.equal(findDuplicate(card({id:'B',fullName:'Ravi Rao',companyName:'Other Inc',email:'ravi@other.com',phone:'1112223333'}),[card()]),null);
});
test('merge retains existing identity, nonblank data and contact channels', () => {
  const existing = card({email:'priya@example.com', phone:'',address:''});
  const merged = mergeCards(existing,card({id:'B',fullName:'Different', email:'new@example.com',phone:'5556667777',address:'Hyderabad',backPreview:'back'}));
  assert.equal(merged.id,'A'); assert.equal(merged.fullName,'Priya Menon');
  assert.equal(merged.email,'priya@example.com, new@example.com');
  assert.equal(merged.phone,'5556667777'); assert.equal(merged.address,'Hyderabad');
  assert.equal(merged.backPreview,'back'); assert.equal(existing.address,'');
});
test('review hints are generated for incomplete or suspicious fields', () => {
  const hints = getReviewHints(card({confidenceScore:'Low',fullName:'',companyName:'',email:'bad-email',phone:'123'}));
  assert.ok(hints.some(h=>h.field==='image')); assert.ok(hints.some(h=>h.field==='fullName'));
  assert.ok(hints.some(h=>h.field==='email')); assert.ok(hints.some(h=>h.field==='phone'));
});
test('clean card has no heuristic warnings', () => assert.deepEqual(getReviewHints(card()),[]));
test('legacy localStorage schema key remains unchanged', () => {
  const storage = fs.readFileSync(path.resolve(__dirname,'../src/lib/storage.ts'),'utf8');
  assert.ok(storage.includes("const KEY = 'visiting-card-ocr:v1'"));
  assert.ok(storage.includes('backPreview: z.string().optional()'));
});
test('Gemini endpoint retains single-image contract and adds optional backImage', () => {
  const endpoint = fs.readFileSync(path.resolve(__dirname,'../src/app/api/extract-card/route.ts'),'utf8');
  assert.ok(endpoint.includes("form.getAll('image')"));
  assert.ok(endpoint.includes("form.getAll('backImage')"));
  assert.ok(endpoint.includes("new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })"));
});

const { resolveReviewJob } = loadModule('review-jobs');
test('merge decision completes associated job after last duplicate is resolved', () => {
  const links = new Map([['candidate-A', 7]]);
  assert.equal(resolveReviewJob(links, 'candidate-A'), 7);
  assert.equal(links.size, 0);
});
test('job remains awaiting review when another candidate in same upload is pending', () => {
  const links = new Map([['candidate-A', 7], ['candidate-B', 7]]);
  assert.equal(resolveReviewJob(links, 'candidate-A'), null);
  assert.equal(resolveReviewJob(links, 'candidate-B'), 7);
});
test('persisted review without active job never marks a different job done', () => {
  const links = new Map([['current-candidate', 8]]);
  assert.equal(resolveReviewJob(links, 'older-candidate'), null);
  assert.equal(links.size, 1);
});
