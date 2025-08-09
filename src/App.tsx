import React, { useRef, useState, useEffect, useCallback } from 'react';
import * as Matter from 'matter-js';
import './App.css';
import { type DrawnShape, recognize } from './utils/geometry';

// Constants
const MOBILE_GUTTER = 12; // px on each side
const MOBILE_UI_ALLOWANCE = 100; // title + instruction + buttons + paddings + watermark
const GROUND_HEIGHT = 25;
const GROUND_COLOR = '#888';

// Custom hook for window dimensions
const useWindowDimensions = () => {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return dimensions;
};

function getRandomColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
}

const App: React.FC = () => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Responsive viewport sizing
  const isMobile = windowWidth <= 600;
  const viewportWidth = isMobile
    ? Math.max(280, Math.floor(windowWidth - MOBILE_GUTTER * 2))
    : 600;
  const viewportHeight = isMobile
    ? Math.max(
      240,
      Math.min(Math.floor(viewportWidth * 1.3), Math.floor(windowHeight - MOBILE_UI_ALLOWANCE))
    )
    : 500;

  const GROUND_TOP = viewportHeight - GROUND_HEIGHT;

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

  // Helper: clear world and add shapes (static when dynamic=false)
  const syncWorldFromShapes = useCallback((dynamic: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    Matter.Composite.clear(engine.world, false, true);
    // Always show ground in both modes
    const ground = Matter.Bodies.rectangle(
      viewportWidth / 2,
      viewportHeight - GROUND_HEIGHT / 2,
      viewportWidth,
      GROUND_HEIGHT,
      { isStatic: true, restitution: 0.8, render: { fillStyle: GROUND_COLOR } }
    );
    Matter.World.add(engine.world, [ground]);
    shapes.forEach(shape => {
      if (shape.type === 'rect') {
        const x = Math.max(0, Math.min(viewportWidth, shape.x));
        const y = Math.max(0, Math.min(viewportHeight, shape.y));
        const w = Math.max(10, Math.min(viewportWidth - x, Math.abs(shape.w)));
        const h = Math.max(10, Math.min(viewportHeight - y, Math.abs(shape.h)));
        const body = Matter.Bodies.rectangle(x + w / 2, y + h / 2, w, h, {
          isStatic: !dynamic,
          restitution: 0.8,
          render: { fillStyle: shape.color },
        });
        Matter.World.add(engine.world, body);
      } else if (shape.type === 'circle') {
        const x = Math.max(0, Math.min(viewportWidth, shape.x));
        const y = Math.max(0, Math.min(viewportHeight, shape.y));
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
  }, [shapes, viewportWidth, viewportHeight]);

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
      options: { width: viewportWidth, height: viewportHeight, wireframes: false, background: '#fff', pixelRatio: 1 },
    });
    renderRef.current = render;

    Matter.Render.run(render);

    // prepare overlay canvas size
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.width = viewportWidth;
      overlay.height = viewportHeight;
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
  }, [viewportWidth, viewportHeight]);

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
  }, [currentShape, mode, GROUND_TOP]);

  // When shapes change, refresh the world (static in draw, dynamic in play)
  useEffect(() => {
    if (mode === 'draw') syncWorldFromShapes(false);
    else if (mode === 'play') syncWorldFromShapes(true);
  }, [shapes, mode, syncWorldFromShapes]);

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
  }, [mode, syncWorldFromShapes]);

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
      <div style={{ width: viewportWidth, height: viewportHeight, margin: '8px auto', position: 'relative', border: '1px solid #333', background: '#fff' }}>
        <div ref={simContainerRef} style={{ width: '100%', height: '100%' }} />
        {mode === 'draw' && (
          <canvas
            ref={overlayRef}
            width={viewportWidth}
            height={viewportHeight}
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
