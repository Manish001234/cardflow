/** Browser-only geometry and pixel helpers. No OpenCV or paid API required. */
export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point]; // top-left, top-right, bottom-right, bottom-left
export const defaultQuad = (): Quad => [{ x: .07, y: .08 }, { x: .93, y: .08 }, { x: .93, y: .92 }, { x: .07, y: .92 }];
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const area = (q: Quad) => Math.abs(q.reduce((sum, p, i) => { const n = q[(i + 1) % 4]; return sum + p.x * n.y - n.x * p.y; }, 0)) / 2;
export function validQuad(q: Quad): boolean {
  if (!q.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return false;
  if (area(q) < .025) return false;
  const cross: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    cross.push((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
  }
  return cross.every(n => n > .0001) || cross.every(n => n < -.0001);
}
export function updateCorner(q: Quad, index: number, x: number, y: number): Quad {
  const next = q.map(p => ({ ...p })) as Quad;
  next[index] = { x: clamp(x), y: clamp(y) };
  return validQuad(next) ? next : q;
}

/** Suggest card bounds from prominent horizontal and vertical image gradients.
 * Conservatively reject weak/ambiguous detection; manual selection remains authoritative.
 */
export function suggestCardQuad(data: Uint8ClampedArray, width: number, height: number): { corners: Quad; confidence: number } | null {
  if (width < 70 || height < 70 || data.length < width * height * 4) return null;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(.299 * data[i*4] + .587 * data[i*4+1] + .114 * data[i*4+2]);
  const xs = new Float64Array(width), ys = new Float64Array(height);
  const marginX = Math.max(4, Math.floor(width * .05)), marginY = Math.max(4, Math.floor(height * .05));
  // Sum gradient projections; skip center text-dense region to prioritize long card edges.
  for (let y = marginY; y < height-marginY; y++) {
    for (let x = marginX; x < width-marginX; x++) {
      const i = y*width+x;
      const dx = Math.abs(gray[i+1] - gray[i-1]);
      const dy = Math.abs(gray[i+width] - gray[i-width]);
      if (dx > 18) xs[x] += dx;
      if (dy > 18) ys[y] += dy;
    }
  }
  const peaks = (scores: Float64Array, length: number) => {
    const start = Math.floor(length*.07), end = Math.ceil(length*.93);
    const candidates = Array.from({length: end-start}, (_,i)=>i+start).sort((a,b)=>scores[b]-scores[a]);
    const first = candidates[0];
    const second = candidates.find(i=>Math.abs(i-first)>length*.27);
    if (second===undefined) return null;
    const total = scores.reduce((a,b)=>a+b,0);
    return { low: Math.min(first,second), high: Math.max(first,second), strength: (scores[first]+scores[second])/Math.max(1,total) };
  };
  const x = peaks(xs,width), y = peaks(ys,height);
  if (!x || !y) return null;
  const w=(x.high-x.low)/width,h=(y.high-y.low)/height;
  const confidence=Math.min(1, ((x.strength+y.strength)/2)*12);
  if (w < .25 || h < .20 || confidence < .10) return null;
  const corners: Quad = [
    {x:x.low/width,y:y.low/height},{x:x.high/width,y:y.low/height},
    {x:x.high/width,y:y.high/height},{x:x.low/width,y:y.high/height}
  ];
  return { corners, confidence };
}

// Solve inverse mapping: destination unit square (u,v) -> source quadrilateral.
export function project(q: Quad, u: number, v: number): Point {
  const [a,b,c,d]=q;
  const dx1=b.x-c.x, dx2=d.x-c.x, dx3=a.x-b.x+c.x-d.x;
  const dy1=b.y-c.y, dy2=d.y-c.y, dy3=a.y-b.y+c.y-d.y;
  let g=0,h=0;
  if (Math.abs(dx3)+Math.abs(dy3)>1e-10) {
    const determinant=dx1*dy2-dx2*dy1;
    if (Math.abs(determinant)<1e-10) throw new Error('Crop corners are too distorted. Adjust the corners.');
    g=(dx3*dy2-dx2*dy3)/determinant;
    h=(dx1*dy3-dx3*dy1)/determinant;
  }
  const denominator=g*u+h*v+1;
  return {x:((b.x-a.x+g*b.x)*u+(d.x-a.x+h*d.x)*v+a.x)/denominator,
          y:((b.y-a.y+g*b.y)*u+(d.y-a.y+h*d.y)*v+a.y)/denominator};
}

export function warpPixels(src: ImageData, q: Quad, outputWidth: number, outputHeight: number): ImageData {
  if (!validQuad(q)) throw new Error('Invalid crop corners.');
  const dest = new ImageData(outputWidth, outputHeight);
  const sw=src.width, sh=src.height, srcData=src.data, dst=dest.data;
  for(let y=0;y<outputHeight;y++) {
    const v=(y+.5)/outputHeight;
    for(let x=0;x<outputWidth;x++) {
      const u=(x+.5)/outputWidth;
      const p=project(q,u,v);
      const sx=clamp(p.x*(sw-1),0,sw-1), sy=clamp(p.y*(sh-1),0,sh-1);
      const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,sw-1),y1=Math.min(y0+1,sh-1);
      const fx=sx-x0,fy=sy-y0, i=(y*outputWidth+x)*4;
      for(let k=0;k<3;k++) {
        const tl=srcData[(y0*sw+x0)*4+k],tr=srcData[(y0*sw+x1)*4+k];
        const bl=srcData[(y1*sw+x0)*4+k],br=srcData[(y1*sw+x1)*4+k];
        dst[i+k]=Math.round((tl*(1-fx)+tr*fx)*(1-fy)+(bl*(1-fx)+br*fx)*fy);
      }
      dst[i+3]=255;
    }
  }
  return dest;
}

/** Mild luminance contrast; preserve original hues for colored card text. */
export function enhancePixels(image: ImageData): ImageData {
  const result = new ImageData(new Uint8ClampedArray(image.data),image.width,image.height);
  const arr=result.data, hist=new Uint32Array(256);
  for(let i=0;i<arr.length;i+=4) hist[Math.round(.299*arr[i]+.587*arr[i+1]+.114*arr[i+2])]++;
  const count=image.width*image.height, lower=count*.015, upper=count*.985;
  let acc=0,low=0,high=255;
  for(let i=0;i<256;i++){acc+=hist[i];if(acc>=lower){low=i;break;}}
  acc=0;
  for(let i=0;i<256;i++){acc+=hist[i];if(acc>=upper){high=i;break;}}
  if(high-low<35) return result;
  const gain=Math.min(1.45,240/(high-low));
  for(let i=0;i<arr.length;i+=4) {
    const lum=.299*arr[i]+.587*arr[i+1]+.114*arr[i+2];
    const next=clamp((lum-low)*gain+8,0,255),factor=lum>1?next/lum:1;
    for(let k=0;k<3;k++) arr[i+k]=Math.round(clamp(arr[i+k]*factor,0,255));
  }
  return result;
}
