# MemoryAI Core Components Foundation

Status: Sprint13C Core Components Foundation

These components are shared UI primitives for future MemoryAI pages. They are foundation-only and are not connected to any current page in Sprint13C.

## Rules

- Use `src/design` tokens for colors, radius, spacing, typography, shadows, and motion values.
- Use `src/motion` hooks for interactive motion where relevant.
- Keep components mobile first.
- Do not add business logic.
- Do not add fake data.
- Do not call Supabase.
- Do not call API routes.
- Do not import page-specific modules.
- Do not use GSAP, Lenis, or new dependencies.

## Components

### MemoryButton

Purpose: Shared mobile-friendly button primitive.

Supports:

- `primary`
- `secondary`
- `ghost`
- `loading`
- `disabled`
- press feedback via `usePressMotion`
- reduced motion via `useReducedMotion`

Forbidden:

- Business navigation decisions
- API submission logic
- Hardcoded product copy

### MemoryCard

Purpose: Content grouping surface for meaningful grouped content only.

Supports:

- `depth`: `flat`, `soft`, `elevated`
- `interactive`
- `reveal`
- press feedback when interactive
- reduced motion aware reveal behavior

Forbidden:

- Using cards as a default layout wrapper for every element
- Dashboard-style dense grids

### MemorySurface

Purpose: Shared surface primitive for product atmosphere and material layers.

Supports:

- `background`
- `elevated`
- `glass`
- `quiet`

Forbidden:

- Page-specific background art
- Business state rendering

### MemorySection

Purpose: Mobile-first section layout with optional heading metadata.

Supports:

- `title`
- `description`
- `action`

Forbidden:

- Page routing
- Fetching content
- Hardcoded page copy

### MemoryHero

Purpose: Hero layout container only.

Supports:

- `eyebrow`
- `title`
- `description`
- `media`
- `actions`

Forbidden:

- Concrete homepage copy
- Concrete homepage imagery
- Business-specific CTA behavior

### MemoryActionRow

Purpose: Flexible action group for homepage and product quick actions.

Supports:

- Mobile-first wrapping
- `align`: `start`, `center`, `end`, `stretch`

Forbidden:

- Embedding business actions directly
- Data fetching

### MemoryBottomSheet

Purpose: Basic bottom sheet shell.

Supports:

- `open`
- `title`
- `description`
- `footer`
- reduced-motion aware transition

Forbidden:

- Business flow state machines
- Payment/auth/API logic

### MemoryInput

Purpose: Mobile-friendly input and textarea primitive.

Supports:

- `label`
- `hint`
- `error`
- `multiline`
- reduced-motion aware focus/visual transitions

Forbidden:

- Validation business rules
- API calls
- Form submission logic

### MemoryAvatar

Purpose: Person/avatar primitive for image or fallback initials.

Supports:

- `image`
- `initials`
- `presence`: `none`, `online`, `quiet`, `away`
- custom `size`

Forbidden:

- Generating fake person images
- Avatar provider calls
- Supabase reads
