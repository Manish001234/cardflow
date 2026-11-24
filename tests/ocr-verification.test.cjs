const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.join(__dirname, '../src/lib/contact-parser.ts');
const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module: ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const loaded = new Module(file,module);loaded.filename=file;loaded.paths=module.paths;loaded._compile(code,file);
const { parseContact } = loaded.exports;
const lines = (str,score=.96) => str.split('\n').map(text=>({text,score}));
test('realistic business card retains name, director and full company',()=>{
  const c=parseContact(lines('Shakeelahmed Jamadar\nDirector\nMushroom World FutureTech Pvt. Ltd.\n+91 9738438028\nshakeel@mushroomworldgroup.com\nwww.mwfuturetech.com\nHead Office 226 Jain Nagar Road'));
  assert.equal(c.fullName,'Shakeelahmed Jamadar');
  assert.equal(c.jobTitle,'Director');
  assert.equal(c.companyName,'Mushroom World FutureTech Pvt. Ltd.');
  assert.match(c.email,/shakeel@/);
  assert.match(c.website,/mwfuturetech/);
});
test('high page confidence does not imply High for missing name',()=>{
  const c=parseContact(lines('MANAGER\nhello@reallygreatsite.com\n123-456-7890'));
  assert.notEqual(c.confidenceScore,'High');
});
test('single word HRITHIK title and brand preserved',()=>{
  const c=parseContact(lines('HRITHIK\nMANAGER\nINOVARA\nhello@reallygreatsite.com\n123-456-7890'));
  assert.equal(c.fullName,'Hrithik');assert.equal(c.companyName,'INOVARA');
});
test('unreadable garbage is not exported as a note',()=>{
  const c=parseContact([{text:'Shakeelahmed Jamadar',score:.95},{text:'Director',score:.96},{text:'X 8 #] f$ %',score:.30}]);
  assert.equal(c.notes,'');
});
test('per-line OCR boxes and confidence forwarded to parser',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/lib/browser-ocr.ts'),'utf8');
  assert.match(source,/blocks: true/);assert.match(source,/line\.confidence/);assert.match(source,/line\.bbox\?\.y0/);
});
test('review-before-save prevents direct uploads from OCR loop',()=>{
  const page=fs.readFileSync(path.join(__dirname,'../src/app/page.tsx'),'utf8');
  const start=page.indexOf('const processQueue');const end=page.indexOf('const retryFailed');
  assert.ok(start>=0 && end>start);
  assert.doesNotMatch(page.slice(start,end),/await uploadOriginals/);
  assert.match(page.slice(start,end),/setScanDrafts/);
  assert.match(page,/const confirmScan = async/);
  assert.match(page,/ScanVerification/);
});
