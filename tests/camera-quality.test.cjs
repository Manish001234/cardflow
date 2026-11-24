const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/components/CameraCapture.tsx'), 'utf8');

test('high resolution rear camera and live preview, supported-device fallback', () => {
  assert.match(source, /facingMode: \{ ideal: preferred \}/);
  assert.match(source, /width: \{ ideal: 2560 \}/);
  assert.match(source, /height: \{ ideal: 1920 \}/);
  assert.match(source, /getUserMedia\(\{ audio: false, video: true \}\)/);
  assert.match(source, /h-\[min\(61dvh,560px\)\]/);
});

test('full resolution still photo is preferred but canvas fallback stays usable', () => {
  assert.match(source, /stillPhotoCamera\(track\)/);
  assert.match(source, /await still\.takePhoto\(\)/);
  assert.match(source, /if \(!blob \|\| !blob\.size\)/);
  assert.match(source, /const maxEdge = 4096/);
  assert.match(source, /canvas\.toBlob\(resolve, 'image\/jpeg', 0\.94\)/);
  assert.match(source, /validateImage\(file\)/);
  assert.match(source, /setPending\(file\)/);
});

test('focus torch zoom are capability gated and unsupported controls are absent', () => {
  assert.match(source, /capabilities\.focusMode\?\.includes\('continuous'\)/);
  assert.match(source, /if \(canFocus\)/);
  assert.match(source, /capabilities\.torch === true/);
  assert.match(source, /if \(range && Number\.isFinite/);
  assert.match(source, /\{focusAvailable &&/);
  assert.match(source, /\{torchAvailable &&/);
  assert.match(source, /\{zoomRange &&/);
  assert.match(source, /track\.applyConstraints/);
});

test('no accidental new API or persistence path in camera', () => {
  assert.match(source, /<CardCropEditor file=\{pending\}/);
  assert.match(source, /const accepted = onScan\(frontFile, backFile\)/);
  assert.match(source, /stream\.current\?\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.doesNotMatch(source, /\/api\/extract-card|GEMINI_API_KEY|OPENAI_API_KEY/);
});

test('both side capture and native device photo fallback remain', () => {
  assert.match(source, /capture="environment"/);
  assert.match(source, /aria-label=\{`Retake \$\{target\}`\}/);
  assert.match(source, /setSide\('back'\)/);
  assert.match(source, /URL\.revokeObjectURL/);
});
