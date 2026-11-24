const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'src/lib/crop-gesture-geometry.ts'), 'utf8');
const js = ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
const mod = new Module('crop-gesture-geometry.cjs');
mod.filename = path.join(__dirname, 'crop-gesture-geometry.cjs');
mod.paths = Module._nodeModulePaths(root);
mod._compile(js.outputText, mod.filename);
const { quadFromRectangle, rectangleFromQuad, resizeRectangle, moveQuad } = mod.exports;
const start = { x: .2, y: .25, width: .6, height: .5 };
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);
test('left edge changes left only and keeps right edge fixed', () => {
  const rect = resizeRectangle(start, 'w', .1, .3);
  closeTo(rect.x, .3); closeTo(rect.x + rect.width, .8); closeTo(rect.y, .25); closeTo(rect.height, .5);
});
test('right edge changes right only, not height', () => {
  const rect = resizeRectangle(start, 'e', -.2, .2);
  closeTo(rect.x, .2); closeTo(rect.x + rect.width, .6); closeTo(rect.y, .25);
});
test('top and bottom handles affect only their respective edge', () => {
  const top = resizeRectangle(start, 'n', 0, .1), bottom = resizeRectangle(start, 's', 0, -.1);
  closeTo(top.y, .35); closeTo(top.y + top.height, .75);
  closeTo(bottom.y, .25); closeTo(bottom.y + bottom.height, .65);
});
test('corners change both attached edges, opposite corner stays fixed', () => {
  const next = resizeRectangle(start, 'nw', .08, .07);
  closeTo(next.x, .28); closeTo(next.y, .32);
  closeTo(next.x + next.width, .8); closeTo(next.y + next.height, .75);
});
test('side minimum size enforced and crop never escapes image', () => {
  const left = resizeRectangle(start, 'w', 99, 0), right = resizeRectangle(start, 'e', -99, 0);
  assert.ok(left.width >= .08 - 1e-9); assert.ok(right.width >= .08 - 1e-9);
  const top = resizeRectangle(start, 'n', 0, -99); closeTo(top.y, 0);
});
test('moving whole crop preserves its shape and clamps boundaries', () => {
  const quad = quadFromRectangle(start);
  const result = moveQuad(quad, .5, -.5);
  closeTo(result[0].x, .4); closeTo(result[0].y, 0);
  closeTo(result[2].x - result[0].x, .6); closeTo(result[2].y - result[0].y, .5);
});
test('perspective quad translation retains original skew', () => {
  const q = [{x:.1,y:.1},{x:.8,y:.2},{x:.7,y:.8},{x:.2,y:.7}];
  const moved = moveQuad(q,.1,.05);
  q.forEach((p,i) => { closeTo(moved[i].x-p.x,.1); closeTo(moved[i].y-p.y,.05); });
});
test('quad and rectangular bounds convert to eight-handle geometry', () => {
  const back = rectangleFromQuad(quadFromRectangle(start));
  for (const key of Object.keys(start)) closeTo(back[key], start[key]);
});
test('editor retains processing, camera callbacks, perspective and adds native gestures', () => {
  const src = fs.readFileSync(path.join(root,'src/components/CardCropEditor.tsx'),'utf8');
  assert.equal(ts.createSourceFile('CardCropEditor.tsx',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics.length,0);
  for (const fragment of ['rectangleHandles.map', "startCropDrag(event, 'move')", 'resizeRectangle(', 'moveQuad(', "chooseCropMode('perspective')", 'updateCorner(', 'setPointerCapture(event.pointerId)', 'straightenCardPhoto(sourceUrl, quad, rotation, file.name, enhanced)', 'PROCESSING_MODES.map', 'onApply(output)', 'createPortal(panel, document.body)']) assert.ok(src.includes(fragment),fragment);
});
