const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'src/lib/card-perspective.ts'),'utf8');
const transpile=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
class FakeImageData { constructor(a,b,c){if(typeof a==='number'){this.width=a;this.height=b;this.data=new Uint8ClampedArray(a*b*4);}else{this.data=a;this.width=b;this.height=c;}} }
const m=new Module('perspective.js');m.filename=path.join(root,'src/lib/card-perspective.ts');m.paths=module.paths;
const contents=`const ImageData=globalThis.__testImageData;\n`+transpile.outputText;
globalThis.__testImageData=FakeImageData;
m._compile(contents,m.filename);
const {defaultQuad,validQuad,updateCorner,project,warpPixels,suggestCardQuad,enhancePixels}=m.exports;
test('TypeScript geometry parses cleanly',()=>assert.equal(ts.createSourceFile('card-perspective.ts',code,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0));
test('reject invalid / crossed crop corners and preserve previous valid selection',()=>{
 const q=defaultQuad();assert.equal(validQuad(q),true);
 const invalid=updateCorner(q,0,.99,.99);assert.deepEqual(invalid,q);
 const shifted=updateCorner(q,0,.1,.1);assert.equal(validQuad(shifted),true);
});
test('homography maps destination corners to selected quadrilateral',()=>{
 const q=[{x:.2,y:.1},{x:.9,y:.25},{x:.8,y:.9},{x:.1,y:.75}];
 for(const [u,v,i] of [[0,0,0],[1,0,1],[1,1,2],[0,1,3]]) {
  const p=project(q,u,v); assert.ok(Math.abs(p.x-q[i].x)<1e-8);assert.ok(Math.abs(p.y-q[i].y)<1e-8);
 }
});
test('perspective warping produces a valid image and enhancement preserves alpha',()=>{
 const src=new FakeImageData(20,12);
 for(let y=0;y<src.height;y++) for(let x=0;x<src.width;x++){const k=(y*src.width+x)*4;src.data[k]=x*10;src.data[k+1]=y*18;src.data[k+2]=100;src.data[k+3]=255;}
 const warped=warpPixels(src,defaultQuad(),10,6);assert.equal(warped.data.length,240);assert.ok(warped.data[0]>0);
 const enhanced=enhancePixels(warped);assert.equal(enhanced.data.length,240);assert.equal(enhanced.data[3],255);
});
test('edge detector rejects blank/unusable images and suggests bounds on simple high-contrast card',()=>{
 const w=240,h=160, blank=new Uint8ClampedArray(w*h*4);blank.fill(180);
 assert.equal(suggestCardQuad(blank,w,h),null);
 const arr=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const v=x>=40&&x<=200&&y>=35&&y<=125?240:40;
 const k=(y*w+x)*4;arr[k]=arr[k+1]=arr[k+2]=v;arr[k+3]=255;
 }
 const result=suggestCardQuad(arr,w,h);
 assert.ok(result,'card rectangle should be recognized');
 assert.ok(result.corners[0].x>.08&&result.corners[0].x<.35);
 assert.ok(result.corners[2].y>.6&&result.corners[2].y<.9);
});
