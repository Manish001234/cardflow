const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'src/lib/ocr-image-processing.ts'), 'utf8');
const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
assert.equal(js.diagnostics?.length ?? 0, 0);
const mod = new Module('ocr-image-processing.cjs');
mod.filename = path.join(__dirname, 'ocr-image-processing.cjs');
mod.paths = Module._nodeModulePaths(root);
mod._compile(js.outputText, mod.filename);
const { processPixels, contactQuality, shouldTryAlternative, preferAlternative, PROCESSING_MODES } = mod.exports;
const ImageDataBackup = global.ImageData;
global.ImageData = class ImageData {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
};
const input = () => new ImageData(Uint8ClampedArray.from([
  15,15,15,255, 70,70,70,255, 180,180,180,255,
  50,50,50,255, 125,125,125,255, 240,240,240,255,
  25,25,25,255, 90,90,90,255, 220,220,220,255,
]), 3, 3);
const base = { fullName:'', jobTitle:'Director', companyName:'Mushroom World FutureTech Pvt. Ltd.', email:'shakeel@mushroomworldgroup.com', phone:'+919738438028', website:'www.mwfuturetech.com', address:'', confidenceScore:'Low' };
test('five image processing modes are available with original default', () => {
  assert.deepEqual(PROCESSING_MODES.map(m=>m.value), ['original','auto','grayscale','high-contrast','ocr-optimized']);
  const original = input();
  assert.deepEqual([...processPixels(original, 'original').data], [...original.data]);
});
test('every processing mode keeps dimensions and alpha and does not mutate source', () => {
  const original = input(); const before = [...original.data];
  for (const mode of PROCESSING_MODES) {
    const out = processPixels(original, mode.value);
    assert.equal(out.width, 3); assert.equal(out.height, 3);
    for (let i=3;i<out.data.length;i+=4) assert.equal(out.data[i],255);
  }
  assert.deepEqual([...original.data],before);
});
test('high contrast and OCR optimized change pixels but keep source untouched', () => {
  const source = input(); const original = [...source.data];
  const contrast = processPixels(source, 'high-contrast');
  const optimized = processPixels(source, 'ocr-optimized');
  assert.notDeepEqual([...contrast.data], original);
  assert.notDeepEqual([...optimized.data], original);
  assert.deepEqual([...source.data], original);
});
test('alternative recognizes missing full name but cannot replace a good name with nothing', () => {
  const second = { ...base, fullName:'Shakeelahmed Jamadar', confidenceScore:'Medium' };
  assert.ok(shouldTryAlternative(base));
  assert.ok(preferAlternative(base, second));
  assert.equal(preferAlternative(second, base),false);
  assert.ok(contactQuality(second)>contactQuality(base));
});
test('complete high confidence contact does not need an expensive second OCR pass', () => {
  const contact = {...base, fullName:'Shakeelahmed Jamadar',confidenceScore:'High'};
  assert.equal(shouldTryAlternative(contact),false);
});
test('OCR source preserves diagnostics, front/back, and only bounded alternative processing', () => {
  const source=fs.readFileSync(path.join(root,'src/lib/browser-ocr.ts'),'utf8');
  assert.match(source, /parseContactWithDiagnostics\(lines\)/);
  assert.match(source, /rememberOCRDiagnostics\(id, diagnostics\)/);
  assert.match(source, /const alternativeLines = await recognize\(variant, back\)/);
  assert.match(source, /shouldTryAlternative\(result.contact\)/);
  assert.match(source, /preferAlternative\(result.contact, alternative.contact\)/);
  assert.doesNotMatch(source, /\/api\/extract-card|GEMINI_API_KEY|OPENAI_API_KEY/);
});
test('crop editor uses selected processing mode without changing perspective geometry', () => {
  const source=fs.readFileSync(path.join(root,'src/components/CardCropEditor.tsx'),'utf8');
  assert.match(source, /Image processing mode/);
  assert.match(source, /PROCESSING_MODES\.map/);
  assert.match(source, /warpPixels\(imageData, quad, width, height\)/);
  assert.match(source, /processPixels\(warped, mode\)/);
  assert.match(source, /onApply\(output\)/);
});
process.on('exit',()=>{global.ImageData=ImageDataBackup;});
