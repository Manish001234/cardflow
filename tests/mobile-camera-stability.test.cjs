const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
const camera = fs.readFileSync(path.join(root, 'src/components/CameraCapture.tsx'), 'utf8');
const ocr = fs.readFileSync(path.join(root, 'src/lib/browser-ocr.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('mobile uses worker-based free OCR instead of Paddle/OpenCV on phones', () => {
  assert.match(ocr, /function mobileBrowser\(/);
  assert.match(ocr, /import\('tesseract\.js'\)/);
  assert.match(ocr, /worker\.recognize\(file\)/);
  assert.match(ocr, /await worker\.terminate\(\)/);
  assert.match(ocr, /mobileBrowser\(\) \? await mobileLines\(front, back\) : await paddleLines\(front, back\)/);
  assert.ok(pkg.dependencies['tesseract.js']);
});

test('mobile OCR uses shared contact parser and handles front/back together', () => {
  assert.match(ocr, /parseContact\(lines\)/);
  assert.match(ocr, /\[front, back\]\.filter/);
  assert.doesNotMatch(ocr, /fetch\(|\/api\/extract-card/);
});

test('camera captures compressed smaller photos and stops stream before handoff', () => {
  assert.match(camera, /maxEdge = 1280/);
  assert.match(camera, /canvas\.toBlob\(resolve, 'image\/jpeg', 0\.78\)/);
  const submit = camera.slice(camera.indexOf('  const submit = () => {'),camera.indexOf('  return <>'));
  assert.ok(submit.indexOf('stopCamera()') < submit.indexOf('onScan(frontFile, backFile)'));
});

test('page survives mobile reload with pending scan recovery message', () => {
  assert.match(page, /CAMERA_PENDING_KEY/);
  assert.match(page, /sessionStorage\.setItem\(CAMERA_PENDING_KEY/);
  assert.match(page, /setSection\('scan'\)/);
  assert.match(page, /Your browser restarted before the camera scan finished/);
  assert.match(page, /sessionStorage\.removeItem\(CAMERA_PENDING_KEY\)/);
});
