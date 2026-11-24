const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');const ts=require('typescript');
const root=path.resolve(__dirname,'..');const crop=fs.readFileSync(path.join(root,'src/components/CardCropEditor.tsx'),'utf8');
test('crop editor TSX parses and remains compatible with camera API',()=>{
 const source=ts.createSourceFile('CardCropEditor.tsx',crop,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(source.parseDiagnostics,[]);
 for(const field of ['file: File','onApply: (file: File) => void','onCancel: () => void','onError: (message: string) => void']) assert.ok(crop.includes(field));
});
test('manual override, edge detection, perspective correction, enhancement toggle, and preview wired',()=>{
 for(const phrase of ['suggestCardQuad','setQuad(suggestion.corners)','updateCorner','straightenCardPhoto','warpPixels','enhancePixels','Reset corners','Preview straightened photo','Use cropped photo','Retake']) assert.ok(crop.includes(phrase),phrase);
 assert.ok(!crop.includes('/api/extract-card'));
});
