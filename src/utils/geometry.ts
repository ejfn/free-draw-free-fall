// Types for drawn shapes on the whiteboard
export type DrawnShape =
  | { type: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { type: 'circle'; x: number; y: number; r: number; color: string }
  | { type: 'triangle'; points: [number, number][]; color: string }
  | { type: 'free'; points: [number, number][]; color: string };

// Geometry helpers
export function bbox(points: [number, number][]) {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function pathClosed(points: [number, number][]) {
  if (points.length < 3) return false;
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  const perim = points.reduce((acc, p, i) => acc + (i ? Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0), 0);
  const closeThresh = Math.max(10, perim * 0.05);
  return Math.hypot(x0 - xn, y0 - yn) < closeThresh;
}

// Always return a closed version of the path. If endpoints are not close,
// append the starting point to explicitly close the loop.
export function ensureClosed(points: [number, number][], minClosePx = 8): [number, number][] {
  if (points.length < 2) return points;
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  if (Math.hypot(x0 - xn, y0 - yn) <= minClosePx) return points;
  return [...points, [x0, y0]];
}

export function polygonPerimeter(points: [number, number][]) {
  let p = 0;
  for (let i = 1; i < points.length; i++) {
    p += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return p;
}

export function polygonArea(points: [number, number][]) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    a += (xj * yi - xi * yj);
  }
  return Math.abs(a) / 2;
}

export function rdpDistance(points: [number, number][]) {
  if (points.length < 3) return 0;
  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];
  let maxD = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const num = Math.abs((ey - sy) * x - (ex - sx) * y + ex * sy - ey * sx);
    const den = Math.hypot(ey - sy, ex - sx) || 1;
    const d = num / den;
    if (d > maxD) maxD = d;
  }
  return maxD;
}

export function rdp(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points;
  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];
  let maxD = -1;
  let idx = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const num = Math.abs((ey - sy) * x - (ex - sx) * y + ex * sy - ey * sx);
    const den = Math.hypot(ey - sy, ex - sx) || 1;
    const d = num / den;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (rdpDistance(points) < epsilon) return [points[0], points[points.length - 1]];
  if (maxD > epsilon && idx > 0) {
    const left = rdp(points.slice(0, idx + 1), epsilon);
    const right = rdp(points.slice(idx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

export function countCorners(poly: [number, number][], angleThreshDeg = 35) {
  if (poly.length < 3) return 0;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  let corners = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[(i - 1 + poly.length) % poly.length];
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const v1x = x0 - x1, v1y = y0 - y1;
    const v2x = x2 - x1, v2y = y2 - y1;
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.hypot(v1x, v1y) || 1;
    const mag2 = Math.hypot(v2x, v2y) || 1;
    const ang = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
    const deg = toDeg(ang);
    if (deg < 180 - angleThreshDeg && deg > angleThreshDeg) corners++;
  }
  return corners;
}

export function fitCircle(points: [number, number][]) {
  const n = points.length;
  if (n < 6) return null;
  const meanX = points.reduce((s, p) => s + p[0], 0) / n;
  const meanY = points.reduce((s, p) => s + p[1], 0) / n;
  let Suu = 0, Suv = 0, Svv = 0, Suuu = 0, Suvv = 0, Svvv = 0, Suuv = 0;
  for (const [x, y] of points) {
    const u = x - meanX;
    const v = y - meanY;
    Suu += u * u;
    Suv += u * v;
    Svv += v * v;
    Suuu += u * u * u;
    Suvv += u * v * v;
    Svvv += v * v * v;
    Suuv += u * u * v;
  }
  const den = 2 * (Suu * Svv - Suv * Suv);
  if (Math.abs(den) < 1e-6) return null;
  const uc = (Svv * (Suuu + Suvv) - Suv * (Svvv + Suuv)) / den;
  const vc = (Suu * (Svvv + Suuv) - Suv * (Suuu + Suvv)) / den;
  const cx = meanX + uc;
  const cy = meanY + vc;
  const rs = points.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const r = rs.reduce((s, v) => s + v, 0) / n;
  const variance = rs.reduce((s, v) => s + (v - r) * (v - r), 0) / n;
  const stdRel = Math.sqrt(variance) / (r || 1);
  return { cx, cy, r, stdRel };
}

// Measure how much of a full turn the stroke covers around a center.
// Returns coverage in radians within [0, 2π].
export function angleCoverage(points: [number, number][], cx: number, cy: number) {
  if (points.length < 3) return 0;
  const angs = points.map(([x, y]) => Math.atan2(y - cy, x - cx)).sort((a, b) => a - b);
  const n = angs.length;
  if (n < 2) return 0;
  let maxGap = 0;
  for (let i = 0; i < n - 1; i++) {
    const gap = angs[i + 1] - angs[i];
    if (gap > maxGap) maxGap = gap;
  }
  // wrap-around gap
  const wrapGap = (angs[0] + Math.PI * 2) - angs[n - 1];
  if (wrapGap > maxGap) maxGap = wrapGap;
  const coverage = Math.max(0, Math.min(Math.PI * 2, Math.PI * 2 - maxGap));
  return coverage;
}

export function recognize(pointsRaw: [number, number][], color: string): DrawnShape {
  // Work on a closed path for recognition and free fill
  const rawClosed = ensureClosed(pointsRaw);
  const { w, h } = bbox(rawClosed);
  // Slightly lower simplification than original to preserve roundness
  const eps = Math.max(3, Math.hypot(w, h) * 0.010);
  const pts = rdp(rawClosed, eps);

  if (pts.length >= 3) {
    const corners = countCorners(pts);
    // Use simplified path for circularity metrics to reduce jitter penalty
    const P = polygonPerimeter(pts);
    const A = polygonArea(pts);
    const circularity = (4 * Math.PI * A) / ((P || 1) * (P || 1));

    // Circle first: combine fit quality, aspect, circularity, and low corner count
    const circle = fitCircle(rawClosed.length >= 6 ? rawClosed : pts);
    if (circle) {
      const aspect = w / (h || 1);
      const coverage = angleCoverage(pointsRaw, circle.cx, circle.cy);
      // For circles, do NOT require endpoints to meet; rely on fit + aspect + angular coverage
      const circleOk =
        circle.r > 6 &&
        circle.stdRel < 0.38 &&
        Math.abs(aspect - 1) < 0.55 &&
        coverage > 4.5; // ~258 degrees covered
      if (circleOk) return { type: 'circle', x: circle.cx, y: circle.cy, r: circle.r, color };
    }

    // Rectangle: 4 corners and area close to bbox, and not too circular
    if (corners === 4) {
      const { minX, minY, w, h } = bbox(rawClosed);
      const bboxArea = Math.max(1, w * h);
      const rectangularity = A / bboxArea;
      if (rectangularity > 0.70 && circularity < 0.82) {
        let x = minX, y = minY, W = w, H = h;
        const aspect = W / (H || 1);
        // Snap near-squares to perfect squares but keep center
        if (Math.abs(aspect - 1) < 0.15) {
          const cx = minX + W / 2;
          const cy = minY + H / 2;
          const s = Math.min(W, H);
          x = cx - s / 2;
          y = cy - s / 2;
          W = s; H = s;
        }
        return { type: 'rect', x, y, w: W, h: H, color };
      }
    }

    // Triangle: allow rough triangles (>=3 corners) and non-circular
    if (corners >= 3 && circularity < 0.78) {
      // Choose three well-separated points
      let best: [number, number][] = [];
      let maxSum = -1;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          for (let k = j + 1; k < pts.length; k++) {
            const s = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) +
              Math.hypot(pts[j][0] - pts[k][0], pts[j][1] - pts[k][1]) +
              Math.hypot(pts[k][0] - pts[i][0], pts[k][1] - pts[i][1]);
            if (s > maxSum) { maxSum = s; best = [pts[i], pts[j], pts[k]]; }
          }
        }
      }
      if (best.length === 3) return { type: 'triangle', points: best, color };
    }

    // Fallback to freehand (closed filled polygon)
    return { type: 'free', points: pts, color };
  }

  // Too few points -> minimal closed polygon
  return { type: 'free', points: rawClosed, color };
}
