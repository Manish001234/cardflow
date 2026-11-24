const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.join(__dirname, '../src/lib/contact-parser.ts');
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const loaded = new Module(file, module); loaded.filename=file; loaded.paths=module.paths; loaded._compile(js,file);
const { parseContact } = loaded.exports;
const lines = (data) => data.map(([text,score],i) => ({text,score,top:i*20,left:20}));

test('decorated person name beats garbled tokens, not sent to Notes', () => {
 const c = parseContact(lines([
  ['EE Te ee', .48], ['~ Shakeelahmed Jamadar =', .75], ['Director 3', .85],
  ['Mushroom World FutureTech Pvt. Ltd. rI :', .82],
  ['shakeel@mushroomworldgroup.com', .97], ['+91 9738438028', .97], ['www.mwfuturetech.com', .94]
 ]));
 assert.equal(c.fullName,'Shakeelahmed Jamadar');
 assert.equal(c.jobTitle,'Director');
 assert.equal(c.companyName,'Mushroom World FutureTech Pvt. Ltd.');
 assert.equal(c.notes,'');
 assert.match(c.phone,/9738438028/);
});
test('preserves legitimate punctuated names and corporate titles',()=>{
 const c=parseContact(lines([
  ["Anne-Marie O'Neil",.95],['Director',.92],['Bright Labs Pvt. Ltd.',.89], ['anne@brightlabs.com',.98]
 ]));
 assert.equal(c.fullName,"Anne-Marie O'Neil");
 assert.equal(c.companyName,'Bright Labs Pvt. Ltd.');
});
test('single-word name and brand regression',()=>{
 const c=parseContact(lines([['HRITHIK',.9],['MANAGER',.9],['INOVARA',.9],['hello@reallygreatsite.com',.9]]));
 assert.equal(c.fullName,'Hrithik');assert.equal(c.companyName,'INOVARA');
});
test('does not invent identity from unrecognizable text',()=>{
 const c=parseContact(lines([['EE Te ee',.4],['DIRECTOR',.9],['hello@example.com',.9]]));
 assert.equal(c.fullName,'');assert.equal(c.notes,'');
});
