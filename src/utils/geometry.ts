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

export function recognize(pointsRaw: [number, number][], color: string): DrawnShape {
  const { w, h } = bbox(pointsRaw);
  const eps = Math.max(4, Math.hypot(w, h) * 0.02);
  const closed = pathClosed(pointsRaw);
  const pts = closed ? rdp(pointsRaw, eps) : pointsRaw;

  if (closed && pts.length >= 3) {
    // Try polygonal shapes first
    const corners = countCorners(pts);
    if (corners === 4) {
      const { minX, minY, w, h } = bbox(pointsRaw);
      return { type: 'rect', x: minX, y: minY, w, h, color };
    }
    if (corners === 3) {
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
    // Try circle fit
    const circle = fitCircle(pointsRaw);
    if (circle) {
      // Looser thresholds for usability
      const aspect = w / (h || 1);
      const ok = circle.r > 10 && circle.stdRel < 0.2 && Math.abs(aspect - 1) < 0.3;
      if (ok) return { type: 'circle', x: circle.cx, y: circle.cy, r: circle.r, color };
    }
    // Fallback to freehand (closed spline)
    return { type: 'free', points: pts, color };
  }
  // Open path -> freehand
  return { type: 'free', points: pts, color };
}
