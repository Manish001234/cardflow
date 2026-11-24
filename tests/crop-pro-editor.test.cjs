const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/components/CardCropEditor.tsx'),'utf8');

test('professional editor parses as TSX and retains camera API contract',()=>{
  assert.deepEqual(ts.createSourceFile('CardCropEditor.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics,[]);
  for (const key of ['file: File','onApply: (file: File) => void','onCancel: () => void','onError: (message: string) => void']) assert.ok(source.includes(key),key);
});
test('editor is a client-only full viewport portal with scroll locking and focus management',()=>{
  assert.match(source,/createPortal\(panel, document\.body\)/);
  assert.match(source,/if \(!mounted\) return null;/);
  assert.match(source,/document\.body\.style\.overflow = 'hidden'/);
  assert.match(source,/aria-modal="true"/);
  assert.match(source,/Escape/);
  assert.match(source,/event\.key === 'Tab'/);
  assert.match(source,/fixed inset-0/);
});
test('precise corner handles use pointer capture, keyboard adjustment and image magnifier',()=>{
  assert.match(source,/setPointerCapture\(event\.pointerId\)/);
  assert.match(source,/onPointerCancel/);
  assert.match(source,/onLostPointerCapture/);
  assert.match(source,/size-11/);
  assert.match(source,/ArrowUp ArrowDown ArrowLeft ArrowRight/);
  assert.match(source,/canvas ref=\{magnifier\}/);
  assert.match(source,/drawImage\(img, sx, sy, sample, sample/);
});
test('auto-detection can be overridden, and photo is perspective corrected only on confirmation',()=>{
  for (const fragment of ['suggestCardQuad','suggestion.confidence >= .13','setQuad(defaultQuad())','updateCorner','warpPixels','enhancePixels','Preview straightened photo','Back to crop','Use cropped photo','Retake']) assert.ok(source.includes(fragment),fragment);
  assert.match(source,/straightenCardPhoto\(sourceUrl, quad, rotation, file\.name, enhanced\)/);
  assert.match(source,/onApply\(output\)/);
  assert.doesNotMatch(source,/\/api\/extract-card|gemini|openai/i);
});
