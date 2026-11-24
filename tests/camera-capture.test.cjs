const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const component = fs.readFileSync(path.join(root, 'src/components/CameraCapture.tsx'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');

test('camera integrates with existing two-sided scan queue', () => {
  assert.match(page, /import \{ CameraCapture \} from '@\/components\/CameraCapture'/);
  assert.match(page, /<CameraCapture processing=\{processingCount > 0\} onScan=\{onPair\} onError=\{setNotice\}/);
  assert.match(page, /<TwoSideUploader processing=\{processingCount > 0\} onScan=\{onPair\}/);
});

test('camera requests a permission-based video stream and stops tracks', () => {
  assert.match(component, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(component, /getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(component, /window\.isSecureContext/);
  assert.match(component, /operation\.current !== ticket/);
  assert.match(component, /playsInline/);
});

test('captured photos are converted to File objects without a paid service', () => {
  assert.match(component, /canvas\.toBlob/);
  assert.match(component, /new File\(\[blob\]/);
  assert.match(component, /validateImage\(file\)/);
  assert.match(component, /onScan\(frontFile, backFile\)/);
  assert.doesNotMatch(component, /\/api\/extract-card|gemini|openai/i);
});

test('front and optional back are retakable, and previews are released', () => {
  assert.match(component, /aria-label=\{`Retake \${target}`\}/);
  assert.match(component, /URL\.revokeObjectURL/);
  assert.match(component, /target === 'front'/);
  assert.match(component, /nativeInput\.current\?\.click\(\)/);
  assert.match(component, /capture="environment"/);
});

test('camera UI includes failure handling, accessible dialog and disabled scan while busy', () => {
  assert.match(component, /role="dialog" aria-modal="true"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /disabled=\{!front \|\| processing \|\| busy \|\| !!pending\}/);
  assert.match(component, /NotAllowedError/);
  assert.match(component, /NotFoundError/);
});


test('camera stops live stream and preserves images when queue rejects submission', () => {
  const submit = component.slice(component.indexOf('  const submit = () => {'), component.indexOf('  return <>'));
  assert.match(submit, /stopCamera\(\);/);
  assert.match(submit, /const accepted = onScan\(frontFile, backFile\)/);
  assert.match(submit, /if \(accepted\) close\(\)/);
  assert.match(submit, /still available/);
  assert.match(page, /const onPair = \(front: File, back\?: File\): boolean/);
  assert.match(page, /return false/);
  assert.match(page, /Captured card added to the processing queue/);
  assert.match(page, /return true/);
});

test('camera scan control cannot submit a form', () => {
  assert.match(component, /<button type="button" onClick=\{submit\}/);
});
