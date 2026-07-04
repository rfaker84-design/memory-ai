# MemoryAI Motion Runtime Foundation

Status: Sprint13B Motion Runtime Foundation

This runtime establishes shared Motion primitives only. It is not connected to any page in Sprint13B and does not change UI, API, database, deployment, package dependencies, GSAP, Lenis, Motion Runtime integrations, or Three.js scenes.

## Import

```ts
import {
  MotionProvider,
  useMotionClock,
  useMotionScroll,
  useMotionVelocity,
  useReducedMotion,
  usePressMotion,
  useRevealMotion,
} from "@/src/motion";
```

## Design Token Dependency

All baseline animation values come from `src/design` tokens through `src/motion/config/motion.config.ts`:

- `MemoryMotion.duration.press`
- `MemoryMotion.duration.feedback`
- `MemoryMotion.duration.reveal`
- `MemoryMotion.ease.standard`
- `MemoryMotion.touch.pressScale`
- `MemoryMotion.reveal.initial`
- `MemoryMotion.reveal.target`
- `MemoryMotion.reveal.staggerMin`
- `MemoryMotion.reveal.staggerMax`

## Runtime Modules

- `MotionProvider.tsx`: client provider for runtime context.
- `MotionContext.ts`: shared runtime types and React context.
- `MotionClock.ts`: requestAnimationFrame clock with `time`, `delta`, and `elapsed`.
- `MotionScroll.ts`: scroll position, max scroll, progress, and direction.
- `MotionVelocity.ts`: scroll velocity with clamped velocity outputs.
- `MotionSpring.ts`: dependency-free numeric spring primitive.
- `MotionReduced.ts`: `prefers-reduced-motion` subscription.

## Hooks

- `useMotion`: access runtime context.
- `useMotionClock`: subscribe to RAF frame state.
- `useMotionScroll`: subscribe to scroll state.
- `useMotionVelocity`: subscribe to clamped scroll velocity.
- `useMotionSpring`: derive a spring value from a numeric target.
- `useReducedMotion`: subscribe to reduced-motion preference.
- `usePressMotion`: generate press feedback style and pointer props.
- `useRevealMotion`: generate default reveal baseline style descriptors.

## Reduced Motion

Reduced motion is respected by `MotionReduced`, `useReducedMotion`, `usePressMotion`, and `useRevealMotion`.

Current reduced behavior:

- Reveal resolves immediately to the target state.
- Press scale is reduced from the default design-token value.
- Config includes `disableScrollVelocityEffects` for future consumers.

## Scroll Runtime

`MotionScroll` tracks:

- `x`
- `y`
- `maxX`
- `maxY`
- `progressX`
- `progressY`
- `directionX`
- `directionY`

## Velocity Runtime

`MotionVelocity` computes pixels-per-second velocity from RAF frame time and scroll deltas.

It exposes:

- raw `x` and `y` velocity
- `clampedX` and `clampedY` using `motion.config.ts`

## Performance Notes

- Uses `requestAnimationFrame` directly.
- Uses passive scroll listeners.
- Uses no new dependencies.
- Does not use GSAP or Lenis.
- Does not mutate pages or existing UI.
