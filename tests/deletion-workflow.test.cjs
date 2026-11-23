const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
const table = fs.readFileSync(path.join(root, 'src/components/CardTable.tsx'), 'utf8');
const dialog = fs.readFileSync(path.join(root, 'src/components/DeleteConfirmDialog.tsx'), 'utf8');

test('single delete executes explicit server POST, no optimistic removal', () => {
  assert.match(page, /const onDelete = \(id: string\) => deleteContacts\(\[id\]\)/);
  assert.match(page, /method: 'POST'/);
  assert.match(page, /type: 'delete', id, expectedRevision:/);
  assert.doesNotMatch(page, /const onDelete = .*commitCards/);
});
test('contact removal requires subsequent MongoDB GET verification', () => {
  const start = page.indexOf('const deleteContacts =');
  const end = page.indexOf('const onDelete =', start);
  const handler = page.slice(start, end);
  assert.ok(start !== -1 && end > start);
  assert.match(handler, /fetch\('\/api\/contacts', \{ cache: 'no-store' \}\)/);
  assert.match(handler, /result\.cards\.some\(card => unique\.includes\(card\.id\)\)/);
  assert.ok(handler.indexOf('const verify = await fetch') < handler.indexOf('setCards(result.cards)'));
});
test('bulk delete and clear all reuse explicit delete workflow', () => {
  assert.match(page, /const onBulkDelete = \(ids: string\[\]\) => deleteContacts\(ids\)/);
  assert.match(page, /await deleteContacts\(cardsRef\.current\.map\(card => card\.id\)\)/);
});
test('protects unsynced edits and account changes', () => {
  assert.match(page, /contactDiff\(syncedRef\.current, cardsRef\.current\)\.length > 0/);
  assert.match(page, /if \(accountIdRef\.current !== accountId\)/);
  assert.match(page, /if \(deletionRunning\.current\)/);
});
test('confirmations are in-app with busy and failure feedback', () => {
  assert.match(table, /<DeleteConfirmDialog/);
  assert.match(page, /clearDialogOpen && <DeleteConfirmDialog/);
  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /Deleting…/);
  assert.doesNotMatch(table, /window\.confirm\(`Delete/);
});
