# MemoryAI Legacy Lint Debt Remediation

## Scope and safeguards

- Branch: `chore-legacy-lint-debt`
- Repository: `C:\Users\Administrator\MemoryAi-quality`
- Behavior-preserving lint remediation only; no architecture, product flow, deployment, database, migration, media, create-memory, or Sprint14 visual changes.
- No global ESLint rule was disabled and no repository-wide formatter was run.

## Baseline

The initial `npm run lint` failed with 22 errors and 183 warnings. The result was classified as follows:

| Classification | Baseline | Treatment |
| --- | ---: | --- |
| Error | 22 | 14 corrected in place; 8 removed from lint scope as archived/generated code |
| Warning | 183 | Kept visible; one warning removed as part of an error fix and eight belonged to archived visual experiments |
| Generated | 1 error | Excluded `src/components/write-splash.js`, a one-off source generator containing a raw code template |
| Framework incompatibility | 1 notice | `next lint` is deprecated by Next.js 15 but remains the repository's required lint command; no dependency or script migration was made in this task |
| False positive | 0 confirmed | No finding was suppressed as a false positive |

## Behavior-preserving corrections

- Replaced explicit `any` annotations with narrow legacy memory and Supabase client types.
- Changed variables that are not reassigned to `const` and removed an unused destructured result.
- Escaped JSX quotation marks without changing rendered copy.
- Moved the `SpaceGate` visibility return below unconditional hooks; visible and hidden render results remain unchanged.

## ESLint scope changes

The flat config now excludes only narrowly identified non-runtime legacy artifacts:

- `src/components/splash-v3/**`
- `src/components/splash-v4/**`
- `src/components/splash-v5/**`
- `src/components/write-splash.js`
- `src/lib/consciousness-types.ts`

The versioned splash experiments have no imports from the current application shell and are protected visual legacy code. `write-splash.js` is an automatic source-generation artifact rather than application code. `consciousness-types.ts` is an unreferenced archived V8 simulation with legacy encoding. These exclusions do not alter rule severity or exempt active application directories.

## Remaining debt

`npm run lint` passes with 174 warnings. They remain intentionally visible, primarily `@typescript-eslint/no-unused-vars`, React hook dependency guidance, and `@next/next/no-img-element`. Some warnings are inside explicitly protected directories, including `app/create-memory/**`, and were not changed. They should be handled in separately scoped, behavior-aware tasks rather than by global suppression.

## Validation

- `npm run lint`: PASS, 0 errors and 174 warnings
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS with process-only placeholder credentials for build-time SDK initialization; no secret or environment file was written
- Production/deployment: not performed
