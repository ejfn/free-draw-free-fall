/// <reference types="vite/client" />

declare module 'matter-js' {
  interface Engine {
    currentTimer?: NodeJS.Timeout | null;
  }
}

declare global {
  const Matter: {
    Engine: Matter.Engine;
    Render: Matter.Render;
    Runner: Matter.Runner;
    Bodies: Matter.Bodies;
    Composite: Matter.Composite;
    World: Matter.World;
    Events: Matter.Events;
  };
}
