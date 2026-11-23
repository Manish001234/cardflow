const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const src = fs.readFileSync(path.join(__dirname, '../src/lib/contact-integrity.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('module','exports',js)(mod,mod.exports);
const { normalizeStoredContact, missingCloudContactIds } = mod.exports;
const source = name => fs.readFileSync(path.join(__dirname,'../src', name),'utf8');
test('normalize legacy null revision without changing contact identity', () => {
  const old = { id: 'old', revision: null, fullName: 'First Contact' };
  const record = normalizeStoredContact(old);
  assert.equal(record.revision, 0);
  assert.equal(record.id, old.id);
  assert.equal(record.fullName, old.fullName);
  assert.equal(old.revision, null);
});
test('normalize absent previews and source names without fabricating a new contact', () => {
  const record = normalizeStoredContact({ id:'legacy', createdAt: new Date('2026-11-23T12:00:00.000Z') });
  assert.equal(record.preview, '');
  assert.equal(record.sourceName, '');
  assert.equal(record.createdAt, '2026-11-23T12:00:00.000Z');
});
test('legacy null back preview does not invalidate contact reads', () => {
  const sourceRecord = { id: 'saved', preview: null, backPreview: null, fullName: 'Saved Contact', revision: null };
  const normalized = normalizeStoredContact(sourceRecord);
  assert.equal(normalized.preview, '');
  assert.equal(normalized.backPreview, undefined);
  assert.equal(normalized.fullName, 'Saved Contact');
  assert.equal(sourceRecord.backPreview, null);
});
test('nonempty back preview and cloud image metadata remain unchanged', () => {
  const images = { back: { pathname: 'some-private-path' } };
  const result = normalizeStoredContact({ id: 'new', backPreview: '/api/cards/new/image/back', images });
  assert.equal(result.backPreview, '/api/cards/new/image/back');
  assert.equal(result.images, images);
});
test('report all acknowledged contact IDs missing from cloud read', () => {
  const missing = missingCloudContactIds([{id:'a'},{id:'b'},{id:'c'}],[{id:'a'},{id:'c'}]);
  assert.deepEqual(missing,['b']);
});
test('cloud read containing all saved IDs passes regardless of order', () => {
  assert.deepEqual(missingCloudContactIds([{id:'b'},{id:'a'}],[{id:'a'},{id:'c'},{id:'b'}]),[]);
});
test('GET refuses partial success when stored contact is malformed', () => {
  const route = source('app/api/contacts/route.ts');
  assert.ok(route.includes('if (!parsed.success)'));
  assert.ok(route.includes('return apiError('));
  assert.ok(!route.includes('.filter(result => result.success)'));
});
test('browser saves safety snapshot before updating rendered contacts', () => {
  const page = source('app/page.tsx');
  const start = page.indexOf('const commitCards =');
  const section = page.slice(start,start+1000);
  assert.ok(section.indexOf('localStorage.setItem(') < section.indexOf('setCards(next)'));
});
test('cloud saved requires a follow-up server read after mutations', () => {
  const page = source('app/page.tsx');
  assert.ok(page.includes("const check = await fetch('/api/contacts', { cache: 'no-store' })"));
  assert.ok(page.includes('missingCloudContactIds(syncedRef.current, snapshot.cards)'));
});
