const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(name) {
  const file = path.resolve(__dirname, '../src/lib', `${name}.ts`);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = new Module(file, module);
  loaded.filename = file; loaded.paths = module.paths; loaded._compile(js, file); return loaded.exports;
}
const { parseContact } = load('contact-parser');
const { findDuplicate } = load('duplicates');
const lines = value => value.split('\n').map(text=>({text,score:.95}));
const card = v => ({id:'a',fullName:'',companyName:'',email:'',phone:'',...v});
test('single-word name immediately before title and standalone all-caps company',()=>{
  const c=parseContact(lines('HRITHIK\nMANAGER\nINOVARA\nhello@reallygreatsite.com\n123-456-7890\nwww.reallygreatsite.com'));
  assert.equal(c.fullName,'Hrithik'); assert.equal(c.jobTitle,'MANAGER'); assert.equal(c.companyName,'INOVARA');
});
test('brand above name is detected',()=>{
  const c=parseContact(lines('INOVARA\nHRITHIK\nMANAGER\nhello@reallygreatsite.com'));
  assert.equal(c.fullName,'Hrithik'); assert.equal(c.companyName,'INOVARA');
});
test('single word without job context is not guessed as a name',()=>{
  assert.equal(parseContact(lines('WELCOME\ncontact@example.com')).fullName,'');
});
test('generic shared emails do not match different named people',()=>{
  const match=findDuplicate(card({id:'b',fullName:'Hrithik',email:'hello@reallygreatsite.com'}), [card({id:'a',fullName:'Jaya Prakash',email:'hello@reallygreatsite.com'})]);
  assert.equal(match,null);
});
test('different named people with identical phone do not produce automatic identity match',()=>{
  const match=findDuplicate(card({id:'b',fullName:'Hrithik',phone:'+12345678900'}),[card({id:'a',fullName:'Jaya Prakash',phone:'+12345678900'})]);
  assert.equal(match,null);
});
test('same named person with matching personal email remains exact',()=>{
  const match=findDuplicate(card({id:'b',fullName:'Priya Menon',email:'priya@example.com'}),[card({id:'a',fullName:'Priya Menon',email:'priya@example.com'})]);
  assert.equal(match?.strength,'exact');
});
