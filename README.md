# Free Draw Free Fall

An interactive physics teaching app: draw shapes freehand, auto-detects circles, rectangles, triangles, or splines, and simulates them under gravity.

Play here: [https://ejfn.github.io/free-draw-free-fall/](https://ejfn.github.io/free-draw-free-fall/)

## Features

- Draw any shape with your mouse (freehand)
- Auto-detects circles, rectangles, triangles, or keeps as free spline
- Shapes appear instantly in the viewport
- Press **Fall** to drop and bounce shapes with physics
- Undo and Reset buttons
- Ground is always visible; you can't draw over it
- All in a single shared viewport

## Getting Started

```bash
# Install dependencies
npm install

# Start the app
npm run dev

# Open in your browser
http://localhost:5173/
```

## Usage

1. Draw shapes above the ground line using your mouse.
2. Each shape appears instantly.
3. Press **Fall** to start the physics simulation.
4. Use **Undo** to remove the last shape, or **Reset** to clear all.

### Controls
- Buttons: Draw, Fall, Undo, Reset
- Keyboard: D = Draw, F = Fall, U = Undo, R or Esc = Reset

### Tips for recognition
- Circles: draw a closed round-ish loop; hand jitter is fine.
- Rectangles: draw roughly rectangular loops; they’ll snap to axis-aligned boxes (near-squares snap square).
- Triangles: three-corner shapes are recognized; otherwise shapes stay freehand.

## Tech Stack
- Vite
- React
- TypeScript
- Matter.js (physics)

---
Created by GPT-5 with guidance from Eric · 2025.

