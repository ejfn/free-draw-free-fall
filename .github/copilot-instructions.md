# Copilot Instructions for Free Draw Free Fall

## Project Overview
- This is a Vite + React + TypeScript app for interactive physics teaching.
- Users draw freehand shapes; the app auto-detects circles, rectangles, triangles, or splines, and simulates them under gravity using Matter.js.
- All drawing and simulation occurs in a single shared viewport (Matter.js canvas + overlay for input).

## Key Files & Structure
- `src/App.tsx`: Main UI and logic. Handles drawing, shape recognition, physics setup, and all user interactions.
- `src/App.css`: Basic styling for the app.
- `README.md`: Contains setup, usage, and feature documentation.
- No backend, no API calls, no server-side code.

## Developer Workflows
- **Start dev server:** `npm run dev` (Vite)
- **Install dependencies:** `npm install`
- **Version control:** Standard git workflows; repo is initialized with `.gitignore` and initial commit.
- **No tests or build scripts** beyond Vite defaults.

## Patterns & Conventions
- All shape logic is in `App.tsx`:
  - Drawing uses a transparent overlay canvas for input.
  - Shapes are recognized on mouse up and rendered as static Matter bodies.
  - On "Fall", bodies become dynamic and gravity is enabled.
  - Undo removes the last shape; Reset clears all.
  - Ground is always visible and drawing is blocked over it.
- Shape recognition uses Ramer–Douglas–Peucker simplification, corner counting, and least-squares circle fit.
- All UI state is managed via React hooks; no Redux or context.
- No routing, no code splitting, no external state management.
- All physics is handled client-side via Matter.js; no external communication.

## Integration Points
- Only external dependencies: `react`, `react-dom`, `matter-js`, Vite, TypeScript.
- No custom hooks, no context providers, no service boundaries.
- All code is in a single React component for simplicity and discoverability.

## Examples
- To add a new shape type, extend the `DrawnShape` union and update recognition logic in `App.tsx`.
- To change physics parameters, edit the Matter.js body creation in `syncWorldFromShapes`.
- To update UI, modify the JSX in `App.tsx`.

## Quickstart for AI Agents
- Start with `src/App.tsx` for all logic and UI changes.
- Use Vite dev server for live reload and debugging.
- All conventions and patterns are discoverable in `App.tsx` and `README.md`.
- No hidden build steps, no nonstandard workflows.

---
If any conventions or workflows are unclear, ask the user for clarification before making assumptions.
