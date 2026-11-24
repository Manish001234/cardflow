const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const crop = fs.readFileSync(path.join(root, 'src/components/CardCropEditor.tsx'), 'utf8');
const camera = fs.readFileSync(path.join(root, 'src/components/CameraCapture.tsx'), 'utf8');

function parse(filename, text) {
  const file = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return file.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

test('new camera and crop components parse as TypeScript JSX', () => {
  assert.deepEqual(parse('CameraCapture.tsx', camera), []);
  assert.deepEqual(parse('CardCropEditor.tsx', crop), []);
});

test('camera crops before placing captured image into the existing scan queue', () => {
  assert.match(camera, /setPending\(file\)/);
  assert.match(camera, /<CardCropEditor file=\{pending\}/);
  assert.match(camera, /onApply=\{applyCrop\}/);
  assert.match(camera, /setCapture\(side, file\)/);
  assert.match(camera, /onScan\(frontFile, backFile\)/);
  assert.doesNotMatch(camera, /api\/extract-card|gemini|openai/i);
});

test('phone camera native picker also enters crop editor', () => {
  assert.match(camera, /capture="environment"/);
  assert.match(camera, /setPending\(file\)/);
  assert.match(camera, /const maxEdge = 4096/);
  assert.match(camera, /focusMode\?\.includes\('continuous'\)/);
});

test('cropper preserves source resolution until crop then bounds output', () => {
  assert.match(crop, /const sw = Math.max/);
  assert.match(crop, /Math.min\(1, 2400 \/ Math.max\(sw, sh\)\)/);
  assert.match(crop, /outContext\.drawImage\(rotated, sx, sy, sw, sh/);
  assert.match(crop, /new File\(\[blob\]/);
  assert.match(crop, /onPointerDown/);
  assert.match(crop, /Rotate left/);
  assert.match(crop, /Rotate right/);
});

test('minimum size and boundary constraints protect against empty crop', () => {
  const fn = crop.match(/export function moveCropCorner\(rect: Rect, handle: Handle, x: number, y: number\): Rect \{[\s\S]*?\n\}/);
  assert.ok(fn);
  const source = `type Rect = { x: number; y: number; width: number; height: number };\ntype Handle = 'nw'|'ne'|'sw'|'se';\nconst minSide=0.08;\nconst clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));\n${fn[0]};`;
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {} };
  vm.runInNewContext(js, context);
  const start = { x:0.1,y:0.1,width:0.8,height:0.8 };
  const result = context.exports.moveCropCorner(start,'nw',0.99,0.99);
  assert.ok(result.width >= 0.079 && result.height >= 0.079);
  const result2 = context.exports.moveCropCorner(start,'se',-1,-1);
  assert.ok(result2.width >= 0.079 && result2.height >= 0.079);
});
