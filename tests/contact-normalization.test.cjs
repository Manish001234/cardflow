const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.join(__dirname, '../src/lib/contact-parser.ts');
const js = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const loaded = new Module(file,module); loaded.filename=file; loaded.paths=module.paths; loaded._compile(js,file);
const { parseContact } = loaded.exports;
const lines = arr => arr.map((text,i)=>({text,score:0.94,top:i*24,left:15}));

test('realistic card cleans trailing OCR fragments and retains both office addresses',()=>{
  const record=parseContact(lines([
    'Shakeelahmed Jamadar', 'Director QQ', 'Mushroom World FutureTech Pvt. Ltd. Ld *',
    '+91 9738438028 (2', 'shakeel@mushroomworldgroup.com','www.mwfuturetech.com',
    'Head Office :- 226, Jain Nagar Gufa Mandir Road, Lalghati, Bhopal M.P. - 462001',
    'Corporate Office :- 5th Floor, Bansal One, Arera Colony, Bhopal, M.P. - 462016',
  ]));
  assert.equal(record.fullName,'Shakeelahmed Jamadar');
  assert.equal(record.jobTitle,'Director');
  assert.equal(record.companyName,'Mushroom World FutureTech Pvt. Ltd.');
  assert.equal(record.phone,'+91 9738438028');
  assert.equal(record.email,'shakeel@mushroomworldgroup.com');
  assert.match(record.address,/Head Office/);
  assert.match(record.address,/Corporate Office/);
  assert.match(record.address,/\n/);
  assert.equal(record.notes,'');
});
test('valid specialty titles are not truncated',()=>{
  for(const [title,expected] of [['Director QA','Director QA'],['Director HR','Director HR'],['Director II','Director II'],['Director 3','Director']]){
    const c=parseContact(lines(['John Roberts',title,'Alpine Systems Pvt. Ltd.','john@alpine.com']));
    assert.equal(c.jobTitle,expected);
  }
});
test('multiple legitimate international phones are preserved',()=>{
  const c=parseContact(lines(['Anita Roy','Manager','Dove Systems Pvt. Ltd.','+91 98765 43210','+44 20 7946 0958','anita@dove.com']));
  assert.match(c.phone,/98765 43210/); assert.match(c.phone,/20 7946 0958/);
});
test('clean address line breaks survive exports while unrelated notes remain separate',()=>{
  const c=parseContact(lines(['Asha Varma','Director','Aster Solutions Pvt. Ltd.','asha@aster.com','Head Office: 42 Park Road','Corporate Office: 5th Floor, Central Tower','We build trust']));
  assert.match(c.address,/Head Office: 42 Park Road\nCorporate Office: 5th Floor/);
  assert.match(c.notes,/We build trust/);
});
