import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../next.config.mjs';

test('browser Webpack build stubs optional OpenCV Node modules', () => {
  const input = { resolve: { fallback: { buffer: false } } };
  const result = config.webpack(input, { isServer: false });
  assert.equal(result, input);
  for (const module of ['fs', 'path', 'crypto']) assert.equal(result.resolve.fallback[module], false);
  assert.equal(result.resolve.fallback.buffer, false);
});

test('server Webpack build keeps its Node module resolution unchanged', () => {
  const input = { resolve: { fallback: { fs: 'native-fs' } } };
  const result = config.webpack(input, { isServer: true });
  assert.equal(result.resolve.fallback.fs, 'native-fs');
});
