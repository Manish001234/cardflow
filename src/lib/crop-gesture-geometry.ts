/** Normalized browser-only crop geometry for gallery-style rectangular selection. */
import type { Quad, Point } from './card-perspective';
export type CropRect = { x: number; y: number; width: number; height: number };
export type RectangleHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const MIN_CROP_SIDE = 0.08;
const limit = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function quadFromRectangle(r: CropRect): Quad {
  return [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
}
export function rectangleFromQuad(q: Quad): CropRect {
  const xs = q.map(p => p.x), ys = q.map(p => p.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
/** Sides update one boundary, corners update two. Opposite boundaries stay fixed. */
export function resizeRectangle(rect: CropRect, handle: RectangleHandle, deltaX: number, deltaY: number): CropRect {
  const left = rect.x, right = rect.x + rect.width, top = rect.y, bottom = rect.y + rect.height;
  const nextL = handle.includes('w') ? limit(left + deltaX, 0, right - MIN_CROP_SIDE) : left;
  const nextR = handle.includes('e') ? limit(right + deltaX, left + MIN_CROP_SIDE, 1) : right;
  const nextT = handle.includes('n') ? limit(top + deltaY, 0, bottom - MIN_CROP_SIDE) : top;
  const nextB = handle.includes('s') ? limit(bottom + deltaY, top + MIN_CROP_SIDE, 1) : bottom;
  return { x: nextL, y: nextT, width: nextR - nextL, height: nextB - nextT };
}
/** Preserve dimensions/shape when moving a selection, clamping to the photograph. */
export function moveQuad(q: Quad, deltaX: number, deltaY: number): Quad {
  const minX = Math.min(...q.map(p => p.x)), maxX = Math.max(...q.map(p => p.x));
  const minY = Math.min(...q.map(p => p.y)), maxY = Math.max(...q.map(p => p.y));
  const dx = limit(deltaX, -minX, 1 - maxX), dy = limit(deltaY, -minY, 1 - maxY);
  return q.map((p: Point) => ({ x: p.x + dx, y: p.y + dy })) as Quad;
}
