const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.join(__dirname, '../src/lib/contact-parser.ts');
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = new Module(file, module); mod.filename=file; mod.paths=module.paths; mod._compile(js, file);
const { parseContact, parseContactWithDiagnostics } = mod.exports;
const lines = entries => entries.map(([text,score], index) => ({text, score, top: index*25, left: 30}));
test('trailing angle-bracket OCR noise does not reject real name or send it to Notes', () => {
  const value = parseContactWithDiagnostics(lines([
    ['EE Te ee', 0.42], ['Shakeelahmed Jamadar <', 0.54], ['Director QO', 0.75],
    ['Mushroom World FutureTech Pvt. Ltd.', 0.92], ['shakeel@mushroomworldgroup.com', 0.99],
    ['+91 9738438028', 0.98], ['www.mwfuturetech.com', 0.98],
  ]));
  assert.equal(value.contact.fullName, 'Shakeelahmed Jamadar');
  assert.doesNotMatch(value.contact.notes, /Shakeelahmed/i);
  assert.equal(value.diagnostics.selectedName, 'Shakeelahmed Jamadar');
  const name = value.diagnostics.nameCandidates.find(x=>x.original==='Shakeelahmed Jamadar <');
  assert.equal(name.decision, 'selected');
  assert.equal(name.normalized, 'Shakeelahmed Jamadar');
  assert.equal(name.ocrConfidence, .54);
});
test('legitimate punctuation within a name remains untouched',()=> {
  const result = parseContact(lines([["Anne-Marie O'Neil",.95],['Director',.92],['Bright Labs Pvt. Ltd.',.9]]));
  assert.equal(result.fullName, "Anne-Marie O'Neil");
});
test('single word HRITHIK remains recognized',()=> {
  const result = parseContact(lines([['HRITHIK',.91],['MANAGER',.9],['INOVARA',.9]]));
  assert.equal(result.fullName, 'Hrithik');
});
test('unrecognizable text does not invent a name, and diagnostic rejection reason is exposed',()=> {
  const result = parseContactWithDiagnostics(lines([['EE Te ee',.39],['Director',.95],['hello@example.com',.95]]));
  assert.equal(result.contact.fullName, '');
  assert.equal(result.contact.notes, '');
  assert.ok(result.diagnostics.nameCandidates.some(entry=>entry.decision==='rejected'));
});
test('parseContact return shape remains unchanged with no diagnostics persisted',()=> {
  const result = parseContact(lines([['Jaya Prakash',.9],['Consultant',.9],['jaya@example.com',.97]]));
  assert.equal(Object.prototype.hasOwnProperty.call(result,'diagnostics'),false);
});
test('diagnostics are temporary browser-only and UI allows reviewing candidate names',()=> {
  const memory = fs.readFileSync(path.join(__dirname,'../src/lib/ocr-diagnostics.ts'),'utf8');
  const browser = fs.readFileSync(path.join(__dirname,'../src/lib/browser-ocr.ts'),'utf8');
  const verification = fs.readFileSync(path.join(__dirname,'../src/components/ScanVerification.tsx'),'utf8');
  assert.match(memory,/MAX_SCANS = 8/);
  assert.doesNotMatch(memory,/\blocalStorage\s*\.|\bfetch\s*\(/);
  assert.match(browser,/rememberOCRDiagnostics\(id, diagnostics\)/);
  assert.match(verification,/Raw recognized lines/);
  assert.match(verification,/Use as name/);
  assert.match(verification,/forgetOCRDiagnostics/);
});
