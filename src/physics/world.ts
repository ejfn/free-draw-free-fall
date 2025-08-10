import * as Matter from 'matter-js';
import type { DrawnShape } from '../utils/geometry';

export function addGround(engine: Matter.Engine, viewportWidth: number, viewportHeight: number, groundHeight: number, color: string) {
  const ground = Matter.Bodies.rectangle(
    viewportWidth / 2,
    viewportHeight - groundHeight / 2,
    viewportWidth,
    groundHeight,
    { isStatic: true, restitution: 0.8, render: { fillStyle: color } }
  );
  Matter.World.add(engine.world, [ground]);
  return ground;
}

export function addShapeToWorld(engine: Matter.Engine, shape: DrawnShape, dynamic: boolean, viewportWidth: number, viewportHeight: number) {
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
    return body;
  }
  if (shape.type === 'circle') {
    const x = Math.max(0, Math.min(viewportWidth, shape.x));
    const y = Math.max(0, Math.min(viewportHeight, shape.y));
    const r = Math.max(5, Math.min(300, shape.r));
    const body = Matter.Bodies.circle(x, y, r, {
      isStatic: !dynamic,
      restitution: 0.8,
      render: { fillStyle: shape.color },
    });
    Matter.World.add(engine.world, body);
    return body;
  }
  if (shape.type === 'triangle') {
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
    return body;
  }
  if (shape.type === 'free' && shape.points.length > 2) {
    // Build a filled polygon from the closed point set
    const pts = shape.points.map(([x, y]) => ({ x, y }));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const rel = pts.map(p => ({ x: p.x - cx, y: p.y - cy }));

    // First attempt: single concave polygon decomposition (if available)
    let body = Matter.Bodies.fromVertices(cx, cy, [rel], {
      isStatic: !dynamic,
      restitution: 0.8,
      render: { fillStyle: shape.color },
    }, true);

    if (!body) {
      // Fallback: triangle fan to guarantee a filled compound, matching the drawn outline order
      const parts: Matter.Body[] = [];
      for (let i = 1; i < rel.length - 1; i++) {
        const tri = [rel[0], rel[i], rel[i + 1]];
        const b = Matter.Bodies.fromVertices(cx, cy, [tri], {
          isStatic: !dynamic,
          restitution: 0.8,
          render: { fillStyle: shape.color },
        }, true);
        if (b) parts.push(b);
      }
      if (parts.length) {
        body = Matter.Body.create({ parts });
      }
    }

    if (body) {
      Matter.Body.setStatic(body, !dynamic);
      Matter.World.add(engine.world, body);
    }
    return body;
  }
}

