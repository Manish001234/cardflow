const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'../src/components');
test('contact details report OCR confidence rather than asserting image sharpness',()=>{
 const source=fs.readFileSync(path.join(root,'CardTable.tsx'),'utf8');
 assert.match(source,/OCR confidence<\/span>/);
 assert.doesNotMatch(source,/image clarity<\/span>/);
});
test('scan verification explains scope of OCR confidence',()=>{
 const source=fs.readFileSync(path.join(root,'ScanVerification.tsx'),'utf8');
 assert.match(source,/not camera sharpness or guaranteed accuracy/);
});
