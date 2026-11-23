const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src/lib');
function load(name) {
  const filename = path.join(root, name + '.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)((id) => id.startsWith('./') ? load(id.slice(2)) : require(id), module, module.exports);
  return module.exports;
}
const { addTags, removeTag, filterContacts, normalizeTag, defaultContactFilter } = load('contact-management');
const { importCsvText } = load('contact-import');
function card(props = {}) { return { id: 'A', fullName: 'Priya Menon', jobTitle: '', companyName: 'Example Labs', email: 'priya@example.com', phone: '', website: '', address: '', notes: '', confidenceScore: 'High', preview: '', sourceName: 'scan.jpg', createdAt: '2026-11-01', ...props }; }
test('tag normalization and case-insensitive deduplication', () => {
  const result = addTags(card({ tags: ['Event'] }), [' event  ', '  VIP   Client  ', '']);
  assert.deepEqual(result.tags, ['Event', 'VIP Client']);
  assert.equal(normalizeTag('  Alpha   Beta '), 'Alpha Beta');
});
test('removing one tag preserves all other fields', () => { const source = card({ tags:['Alpha','Beta'] }); const result = removeTag(source,'Alpha'); assert.deepEqual(result.tags,['Beta']); assert.deepEqual(source.tags,['Alpha','Beta']); });
test('favourite, company, tag, review status, clarity, and search filters compose', () => {
  const source = [card({favorite:true,tags:['Expo'],reviewedAt:'today'}),card({id:'B',fullName:'Rahul',companyName:'Other',email:'r@x.com',confidenceScore:'Low'})];
  assert.equal(filterContacts(source, 'priya', { ...defaultContactFilter, favorite:true, tag:'expo', review:'reviewed', confidence:'High', company:'Example Labs' }).length, 1);
  assert.equal(filterContacts(source, '', { ...defaultContactFilter, review:'pending' })[0].id,'B');
});
test('CSV imports alternate names, retains multiline quoted fields and tags', () => {
  const csv = '\uFEFFName,Organisation,Email Address,Notes,Tags,Favorite\r\n"Ada, Lovelace",Widgets,ada@example.org,"Line one\nLine two",Expo;VIP,Yes\r\n';
  const result = importCsvText(csv);
  assert.equal(result.contacts.length, 1); assert.equal(result.contacts[0].fullName, 'Ada, Lovelace');
  assert.equal(result.contacts[0].notes,'Line one\nLine two'); assert.deepEqual(result.contacts[0].tags,['Expo','VIP']);
  assert.equal(result.contacts[0].favorite,true); assert.equal(result.contacts[0].preview,'');
});
test('CSV quoted escaped quotes and blank rows are handled', () => {
  const result = importCsvText('Full Name,Notes\nAda,"Said ""hello"""\n,\nBob,');
  assert.equal(result.contacts[0].notes, 'Said "hello"'); assert.equal(result.contacts.length,2);
});
test('CSV refuses missing contact headers and malformed quoting', () => {
  assert.throws(() => importCsvText('Fruit,Colour\nBanana,Yellow'),/recognized/);
  assert.throws(() => importCsvText('Name,Notes\nAda,"bad'),/unclosed/);
});
test('CSV imports conservative Low clarity if not supplied', () => {
  const result = importCsvText('Full Name,Email,Confidence Score\nAda,ada@example.org,High\nBob,bob@example.org,');
  assert.deepEqual(result.contacts.map(c=>c.confidenceScore),['High','Low']);
});
test('legacy storage key retained; no server OCR', () => {
  const storage = fs.readFileSync(path.resolve(root,'storage.ts'),'utf8');
  const api = fs.readFileSync(path.resolve(root,'../app/api/extract-card/route.ts'),'utf8');
  assert.match(storage,/visiting-card-ocr:v1/); assert.match(storage,/tags: z.array\(z.string\(\)\).optional\(\)/);
  assert.match(api,/status: 410/);
});
test('Excel export includes extra columns for contact metadata', () => {
  const exportSource = fs.readFileSync(path.resolve(root,'export.ts'),'utf8');
  assert.match(exportSource,/\['tags', 'Tags'\]/); assert.match(exportSource,/\['favorite', 'Favorite'\]/);
});

test('merge preserves favourite and unions tags', () => {
  const { mergeCards } = load('duplicates');
  const merged = mergeCards(card({tags:['Expo'],favorite:false}),card({id:'B',tags:['VIP','Expo'],favorite:true}));
  assert.equal(merged.favorite,true); assert.deepEqual(merged.tags,['Expo','VIP']);
});
