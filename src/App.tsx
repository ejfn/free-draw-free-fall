import React, { useRef, useState, useEffect } from 'react';
import * as Matter from 'matter-js';
import './App.css';

// Types for drawn shapes on the whiteboard
export type DrawnShape =
  | { type: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { type: 'circle'; x: number; y: number; r: number; color: string }
  | { type: 'triangle'; points: [number, number][]; color: string }
  | { type: 'free'; points: [number, number][]; color: string };

// Responsive viewport sizing
const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
// On mobile, use nearly full device width with small side gutters to avoid overflow
const MOBILE_GUTTER = 12; // px on each side
const mobileViewportWidth = typeof window !== 'undefined'
  ? Math.min(window.innerWidth || 0, document.documentElement?.clientWidth || window.innerWidth || 0)
  : 375;
const WIDTH = isMobile
  ? Math.max(280, Math.floor(mobileViewportWidth - MOBILE_GUTTER * 2))
  : 600;
// Keep a generous height while staying within typical phone layouts
const mobileViewportHeight = typeof window !== 'undefined'
  ? Math.floor((('visualViewport' in window ? (window as unknown as { visualViewport?: { height?: number } }).visualViewport?.height : undefined) || window.innerHeight || document.documentElement?.clientHeight || window.innerHeight || 667))
  : 667;
const MOBILE_UI_ALLOWANCE = 100; // title + instruction + buttons + paddings + watermark
const HEIGHT = isMobile
  ? Math.max(
    240,
    Math.min(Math.floor(WIDTH * 1.3), Math.floor(mobileViewportHeight - MOBILE_UI_ALLOWANCE))
  )
  : 500;
const GROUND_HEIGHT = 25;
const GROUND_COLOR = '#888';
const GROUND_TOP = HEIGHT - GROUND_HEIGHT;

function getRandomColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
}

// Geometry helpers
function bbox(points: [number, number][]) {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function pathClosed(points: [number, number][]) {
  if (points.length < 3) return false;
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  const perim = points.reduce((acc, p, i) => acc + (i ? Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0), 0);
  const closeThresh = Math.max(10, perim * 0.05);
  return Math.hypot(x0 - xn, y0 - yn) < closeThresh;
}

function rdpDistance(points: [number, number][]) {
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

function rdp(points: [number, number][], epsilon: number): [number, number][] {
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

function countCorners(poly: [number, number][], angleThreshDeg = 35) {
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

function fitCircle(points: [number, number][]) {
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

function recognize(pointsRaw: [number, number][], color: string): DrawnShape {
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

const App: React.FC = () => {
  // Shared Matter viewport
  const simContainerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  // Overlay canvas for freehand drawing preview & input
  const overlayRef = useRef<HTMLCanvasElement>(null);


  const [mode, setMode] = useState<'draw' | 'play'>('draw');
  const [drawing, setDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<DrawnShape | null>(null);
  const [shapes, setShapes] = useState<DrawnShape[]>([]);

  const handleUndo = () => {
    if (shapes.length === 0) return;
    setShapes(prev => prev.slice(0, -1));
  };

  // Initialize Matter renderer once
  useEffect(() => {
    const container = simContainerRef.current;
    if (!container) return;
    // Clear any stale canvases (e.g., StrictMode mount cycles)
    container.innerHTML = '';

    const engine = Matter.Engine.create();
    engine.gravity.y = 0; // no gravity in draw mode
    engineRef.current = engine;

    const render = Matter.Render.create({
      element: container,
      engine,
      options: { width: WIDTH, height: HEIGHT, wireframes: false, background: '#fff', pixelRatio: 1 },
    });
    renderRef.current = render;

    Matter.Render.run(render);

    // prepare overlay canvas size
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.width = WIDTH;
      overlay.height = HEIGHT;
    }

    return () => {
      // cleanup
      if (renderRef.current) {
        Matter.Render.stop(renderRef.current);
        // Remove render canvas from DOM to avoid duplicates
        const canvas = renderRef.current.canvas as HTMLCanvasElement | undefined;
        canvas?.parentElement?.removeChild(canvas);
      }
      if (runnerRef.current && engineRef.current) {
        Matter.Runner.stop(runnerRef.current);
      }
      // Clear container entirely
      if (container) container.innerHTML = '';
      renderRef.current = null;
      runnerRef.current = null;
      engineRef.current = null;
    };
  }, []);

  // Helper: clear world and add shapes (static when dynamic=false)
  const syncWorldFromShapes = (dynamic: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    Matter.Composite.clear(engine.world, false, true);
    // Always show ground in both modes
    const ground = Matter.Bodies.rectangle(
      WIDTH / 2,
      HEIGHT - GROUND_HEIGHT / 2,
      WIDTH,
      GROUND_HEIGHT,
      { isStatic: true, restitution: 0.8, render: { fillStyle: GROUND_COLOR } }
    );
    Matter.World.add(engine.world, [ground]);
    shapes.forEach(shape => {
      if (shape.type === 'rect') {
        const x = Math.max(0, Math.min(WIDTH, shape.x));
        const y = Math.max(0, Math.min(HEIGHT, shape.y));
        const w = Math.max(10, Math.min(WIDTH - x, Math.abs(shape.w)));
        const h = Math.max(10, Math.min(HEIGHT - y, Math.abs(shape.h)));
        const body = Matter.Bodies.rectangle(x + w / 2, y + h / 2, w, h, {
          isStatic: !dynamic,
          restitution: 0.8,
          render: { fillStyle: shape.color },
        });
        Matter.World.add(engine.world, body);
      } else if (shape.type === 'circle') {
        const x = Math.max(0, Math.min(WIDTH, shape.x));
        const y = Math.max(0, Math.min(HEIGHT, shape.y));
        const r = Math.max(5, Math.min(300, shape.r));
        const body = Matter.Bodies.circle(x, y, r, {
          isStatic: !dynamic,
          restitution: 0.8,
          render: { fillStyle: shape.color },
        });
        Matter.World.add(engine.world, body);
      } else if (shape.type === 'triangle') {
        const verts = shape.points.map(([x, y]) => ({ x, y }));
        const cx = (verts[0].x + verts[1].x + verts[2].x) / 3;
        const cy = (verts[0].y + verts[1].y + verts[2].y) / 3;
        const relVerts = verts.map(v => ({ x: v.x - cx, y: v.y - cy }));
        const body = Matter.Bodies.fromVertices(cx, cy, [relVerts], {
          isStatic: !dynamic,
          restitution: 0.8,
          render: { fillStyle: shape.color },
        }, true);
        if (body) Matter.World.add(engine.world, body);
      } else if (shape.type === 'free' && shape.points.length > 2) {
        const absVerts = shape.points.map(([x, y]) => ({ x, y }));
        const cx = absVerts.reduce((s, v) => s + v.x, 0) / absVerts.length;
        const cy = absVerts.reduce((s, v) => s + v.y, 0) / absVerts.length;
        const relVerts = absVerts.map(v => ({ x: v.x - cx, y: v.y - cy }));
        const body = Matter.Bodies.fromVertices(cx, cy, [relVerts], {
          isStatic: !dynamic,
          restitution: 0.8,
          render: { fillStyle: shape.color },
        }, true);
        if (body) Matter.World.add(engine.world, body);
      }
    });
  };

  // Input handlers on overlay
  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'draw') return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y >= GROUND_TOP) return; // don't start drawing over ground
    const color = getRandomColor();
    setDrawing(true);
    setCurrentShape({ type: 'free', points: [[x, y]], color });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing || mode !== 'draw' || !currentShape || currentShape.type !== 'free') return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y >= GROUND_TOP) return; // ignore points over ground region
    setCurrentShape({ ...currentShape, points: [...currentShape.points, [x, y]] });
  };

  const handleMouseUp = () => {
    if (drawing && currentShape && currentShape.type === 'free') {
      const detected = recognize(currentShape.points, currentShape.color);
      // add to list; world will sync in shapes effect
      setShapes(prev => [...prev, detected]);
      setCurrentShape(null);
      setDrawing(false);
    }
  };

  // Touch support (maps to the same logic as mouse)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (mode !== 'draw') return;
    const t = e.touches[0];
    if (!t) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const x = t.clientX - rect.left;
    const y = t.clientY - rect.top;
    if (y >= GROUND_TOP) return;
    e.preventDefault();
    const color = getRandomColor();
    setDrawing(true);
    setCurrentShape({ type: 'free', points: [[x, y]], color });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!drawing || mode !== 'draw' || !currentShape || currentShape.type !== 'free') return;
    const t = e.touches[0];
    if (!t) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const x = t.clientX - rect.left;
    const y = t.clientY - rect.top;
    if (y >= GROUND_TOP) return;
    e.preventDefault();
    setCurrentShape({ ...currentShape, points: [...currentShape.points, [x, y]] });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (drawing && currentShape && currentShape.type === 'free') {
      e.preventDefault();
      const detected = recognize(currentShape.points, currentShape.color);
      setShapes(prev => [...prev, detected]);
      setCurrentShape(null);
      setDrawing(false);
    }
  };

  // Draw current freehand on overlay
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (mode === 'draw' && currentShape && currentShape.type === 'free' && currentShape.points.length > 1) {
      ctx.strokeStyle = currentShape.color;
      ctx.lineWidth = 2;
      let drawingSeg = false;
      for (let i = 0; i < currentShape.points.length; i++) {
        const [px, py] = currentShape.points[i];
        if (py < GROUND_TOP) {
          if (!drawingSeg) {
            ctx.beginPath();
            ctx.moveTo(px, py);
            drawingSeg = true;
          } else {
            ctx.lineTo(px, py);
          }
        } else if (drawingSeg) {
          ctx.stroke();
          drawingSeg = false;
        }
      }
      if (drawingSeg) ctx.stroke();
    }
  }, [currentShape, mode]);

  // When shapes change, refresh the world (static in draw, dynamic in play)
  useEffect(() => {
    if (mode === 'draw') syncWorldFromShapes(false);
    else if (mode === 'play') syncWorldFromShapes(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, mode]);

  const handleReset = () => {
    setShapes([]);
    setCurrentShape(null);
    setDrawing(false);
    // stop sim and clear world
    if (runnerRef.current && engineRef.current) {
      Matter.Runner.stop(runnerRef.current);
      runnerRef.current = null;
    }
    if (engineRef.current) {
      Matter.Composite.clear(engineRef.current.world, false, true);
      engineRef.current.gravity.y = 0;
    }
    // clear overlay
    const overlay = overlayRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      ctx?.clearRect(0, 0, overlay.width, overlay.height);
    }
    setMode('draw');
  };

  const handlePlay = () => {
    setMode('play');
    const engine = engineRef.current;
    if (!engine) return;
    engine.gravity.y = 1;
    syncWorldFromShapes(true);
    // start or restart runner
    if (runnerRef.current) {
      Matter.Runner.stop(runnerRef.current);
    }
    const runner = Matter.Runner.create();
    runnerRef.current = runner;
    Matter.Runner.run(runner, engine);
  };

  // Switch back to draw: ensure static display
  useEffect(() => {
    if (mode === 'draw') {
      if (runnerRef.current && engineRef.current) {
        Matter.Runner.stop(runnerRef.current);
        runnerRef.current = null;
      }
      if (engineRef.current) engineRef.current.gravity.y = 0;
      syncWorldFromShapes(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Set document title
  useEffect(() => {
    document.title = 'Free Draw Free Fall';
  }, []);

  return (
    <div style={{ textAlign: 'center' }}>
      <h1>Free Draw Free Fall</h1>
      <div>
        <div style={{ marginBottom: isMobile ? 6 : 12, fontSize: isMobile ? '0.9em' : '1.05em' }}>
          Draw any shape you like. Press <b>Fall</b> to see them drop and bounce.
        </div>
        <button onClick={() => setMode('draw')} disabled={mode === 'draw'}>Draw</button>
        <button onClick={handlePlay} disabled={mode === 'play'}>Fall</button>
        <button onClick={handleUndo} disabled={shapes.length === 0}>Undo</button>
        <button onClick={handleReset}>Reset</button>
      </div>
      <div style={{ width: WIDTH, height: HEIGHT, margin: '8px auto', position: 'relative', border: '1px solid #333', background: '#fff' }}>
        <div ref={simContainerRef} style={{ width: '100%', height: '100%' }} />
        {mode === 'draw' && (
          <canvas
            ref={overlayRef}
            width={WIDTH}
            height={HEIGHT}
            style={{ position: 'absolute', inset: 0, cursor: 'crosshair', touchAction: 'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          />
        )}
      </div>
      <div style={{
        textAlign: 'center',
        fontSize: '0.9rem',
        color: '#888',
        margin: '8px 0 0 0'
      }}>
        Created by GPT-5 with guidance from Eric · 2025
      </div>
    </div>
  );
};

export default App;
