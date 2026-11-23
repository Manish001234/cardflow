const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = rel => fs.readFileSync(path.resolve(__dirname,'../src',rel),'utf8');
const blob = source('lib/blob-policy.ts');
const js = ts.transpileModule(blob, { compilerOptions:{ module: ts.ModuleKind.CommonJS,target: ts.ScriptTarget.ES2022 } }).outputText;
const m = { exports:{} };new Function('require','module','exports',js)(require,m,m.exports);
const { blobPath, validImagePath } = m.exports;
const user='0123456789abcdef01234567', id='11111111-1111-4111-8111-111111111111';
const file={type:'image/png',size:5000};
test('image path is scoped to specific user and card',()=>{
 const path=blobPath(user,id,'front',file);
 assert.ok(validImagePath(path,user,id,'front'));
 assert.ok(!validImagePath(path,'abcdef0123456789abcdef01',id,'front'));
 assert.ok(!validImagePath(path,user,'22222222-2222-4222-8222-222222222222','front'));
 assert.ok(!validImagePath(path,user,id,'back'));
});
test('reject disallowed type and oversized image',()=>{
 assert.throws(()=>blobPath(user,id,'front',{type:'image/svg+xml',size:500}));
 assert.throws(()=>blobPath(user,id,'front',{type:'image/png',size:11*1024*1024}));
 assert.throws(()=>blobPath(user,id,'front',{type:'image/png',size:0}));
});
test('blob upload requires authentication before generating token',()=>assert.match(source('app/api/blob/upload/route.ts'),/await getViewer\(\)/));
test('upload restricts MIME and file size',()=>{
 const r=source('app/api/blob/upload/route.ts');
 assert.match(r,/maximumSizeInBytes: MAX_IMAGE_BYTES/);
 assert.match(r,/allowedContentTypes: \['image\/jpeg', 'image\/png', 'image\/webp'\]/);
});
test('private image route checks contact ownership and serves private blob',()=>{
 const r=source('app/api/cards/[id]/image/[side]/route.ts');
 assert.match(r,/findOne\(\{ userId: new ObjectId\(viewer.id\), id \}/);
 assert.match(r,/get\(pathname, \{ access: 'private' \}\)/);
 assert.match(r,/private, no-store/);
});
test('contact writing validates private metadata and uses revisions',()=>{
 const r=source('app/api/contacts/route.ts');
 assert.match(r,/await verifyImages\(viewer.id, card\)/);
 assert.match(r,/revisionMatch\(expected\)/);
 assert.match(r,/status: 409|apiError\([^\n]*409\)/);
 assert.match(r,/newRevision = expected \+ 1/);
});
test('client uploads originals directly into private blob',()=>{
 const r=source('lib/cloud-images.ts');
 assert.match(r,/access: 'private'/);
 assert.match(r,/upload\(pathname, file/);
});
test('one sync operation per request and conflicts are surfaced',()=>{
 const r=source('app/page.tsx');
 assert.match(r,/const batch = \[operations\[i\]\]/);
 assert.match(r,/response.status === 409/);
});

test('merge keeps existing front image but adopts missing back image',()=>{
 const code=source('lib/duplicates.ts');
 assert.match(code,/if \(!merged.images\?\.front && incoming.images\?\.front\)/);
 assert.match(code,/if \(!merged.images\?\.back && incoming.images\?\.back\)/);
});
test('orphan cleanup checks contact references before deletion',()=>{
 const script=fs.readFileSync(path.resolve(__dirname,'../scripts/reconcile-blobs.mjs'),'utf8');
 assert.match(script,/contacts'\)\.findOne/);
 assert.match(script,/await del\(path\)/);
});
