# MemoryAI Design Tokens

Status: Sprint13A Design System Foundation

This document records the initial shared MemoryAI design foundation. It is a foundation only; no existing page UI, Motion Runtime, Three.js scene, API, database, or SQL was changed.

## Import

```ts
import {
  MemoryTheme,
  MemoryMotion,
  MemorySurface,
  MemorySpacing,
  MemoryRadius,
  MemoryTypography,
  MemoryShadow,
} from "@/src/design";
```

## Core Exports

- `MemoryTheme` from `src/design/theme/theme.ts`
- `MemoryMotion` from `src/design/tokens/motion.ts`
- `MemorySurface` from `src/design/tokens/colors.ts`
- `MemorySpacing` from `src/design/tokens/spacing.ts`
- `MemoryRadius` from `src/design/tokens/radius.ts`
- `MemoryTypography` from `src/design/tokens/typography.ts`
- `MemoryShadow` from `src/design/tokens/shadow.ts`

Additional direct token exports:

- `MemoryColors`
- `MemoryZIndex`
- `MemoryOpacity`

## Color / Surface Tokens

File: `src/design/tokens/colors.ts`

- `MemorySurface.background.base`: warm black primary background
- `MemorySurface.background.warm`: warm dark background layer
- `MemorySurface.background.elevated`: elevated dark surface
- `MemorySurface.background.veil`: translucent dark veil
- `MemorySurface.content.primary`: warm primary text
- `MemorySurface.content.secondary`: warm secondary text
- `MemorySurface.content.muted`: muted text
- `MemorySurface.content.inverse`: inverse text on warm accent
- `MemorySurface.accent.gold`: primary restrained warm gold
- `MemorySurface.accent.amber`: low-saturation amber
- `MemorySurface.accent.skin`: soft skin-tone light
- `MemorySurface.accent.warmWhite`: warm white highlight
- `MemorySurface.state.success`: calm success
- `MemorySurface.state.warning`: warm warning
- `MemorySurface.state.danger`: restrained danger
- `MemorySurface.state.focus`: accessible focus ring color
- `MemorySurface.border.subtle`: low-contrast border
- `MemorySurface.border.warm`: warm border
- `MemorySurface.border.strong`: stronger warm border

## Spacing Tokens

File: `src/design/tokens/spacing.ts`

- `none`, `px`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`, `5xl`, `6xl`
- `pageXMobile`: mobile horizontal page padding
- `pageYMobile`: mobile vertical page padding
- `sectionGap`: section-level spacing
- `contentGap`: content-level spacing
- `safeBottom`: `env(safe-area-inset-bottom)`
- `safeTop`: `env(safe-area-inset-top)`

## Radius Tokens

File: `src/design/tokens/radius.ts`

- `none`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `full`
- `card`: default grouped content radius
- `control`: button/input radius
- `sheet`: sheet/modal radius
- `avatar`: circular person/avatar radius

## Shadow Tokens

File: `src/design/tokens/shadow.ts`

- `none`
- `ambient`: large restrained depth shadow
- `card`: grouped content depth shadow
- `glowWarm`: restrained warm glow
- `glowSoft`: soft atmosphere glow
- `insetSurface`: subtle material highlight
- `focus`: accessible focus ring

## Typography Tokens

File: `src/design/tokens/typography.ts`

- `fontFamily.sans`
- `fontFamily.zh`
- `size.caption`, `meta`, `body`, `bodyLarge`, `title`, `hero`
- `lineHeight.compact`, `normal`, `relaxed`
- `weight.regular`, `medium`, `semibold`
- `letterSpacing.calm`, `title`

## Z-Index Tokens

File: `src/design/tokens/zIndex.ts`

Visual layer mapping follows the governance baseline:

- `background`
- `atmosphere`
- `environment`
- `subject`
- `content`
- `interaction`
- `navigation`
- `overlay`
- `toast`
- `modal`

## Opacity Tokens

File: `src/design/tokens/opacity.ts`

- `hidden`
- `disabled`
- `muted`
- `secondary`
- `primary`
- `full`
- `glass`
- `veil`

## Motion Tokens

File: `src/design/tokens/motion.ts`

- `duration.press`: 90ms
- `duration.exit`: 220ms
- `duration.feedback`: 240ms
- `duration.enter`: 520ms
- `duration.reveal`: 720ms
- `ease.standard`: `cubic-bezier(0.16, 1, 0.3, 1)`
- `ease.softOut`
- `ease.linear`
- `reveal.initial`
- `reveal.target`
- `reveal.staggerMin`
- `reveal.staggerMax`
- `pageTransition.exit`
- `pageTransition.enter`
- `touch.pressScale`
- `touch.releaseScale`

## Component Foundation Tokens

These are token objects, not UI rewrites.

- `MemoryButton`: `src/design/components/Button/index.ts`
- `MemoryCard`: `src/design/components/Card/index.ts`
- `MemorySurfaceComponent`: `src/design/components/Surface/index.ts`
- `MemorySection`: `src/design/components/Section/index.ts`

## Theme

File: `src/design/theme/theme.ts`

`MemoryTheme` groups:

- `surface`
- `spacing`
- `radius`
- `shadow`
- `typography`
- `zIndex`
- `opacity`
- `motion`
