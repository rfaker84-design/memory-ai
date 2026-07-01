# memory_fragments Audit

## Where Used

| File | Usage |
| --- | --- |
| `app/create-memory/page.tsx` | Inserts memory fragments after a Memory is created. |
| `app/memory-chat/[id]/page.tsx` | Reads recent fragments for the memory chat page state. |
| `app/api/memory-chat/route.ts` | Reads fragments to build chat prompt context for AI replies. |

## Fields Used

| Field | Used In | Purpose |
| --- | --- | --- |
| `memory_id` | `app/create-memory/page.tsx`, `app/memory-chat/[id]/page.tsx`, `app/api/memory-chat/route.ts` | Links fragments to a Memory record and filters fragments by Memory. |
| `source_type` | `app/create-memory/page.tsx`, `app/memory-chat/[id]/page.tsx`, `app/api/memory-chat/route.ts` | Stores fragment category and labels prompt context. Current inserted values: `catch_phrase`, `habit`, `anger_style`, `comfort_style`, `story`. |
| `content` | `app/create-memory/page.tsx`, `app/memory-chat/[id]/page.tsx`, `app/api/memory-chat/route.ts` | Stores the fragment text shown or injected into prompt context. |
| `created_at` | `app/memory-chat/[id]/page.tsx`, `app/api/memory-chat/route.ts` | Sorts fragments newest first. |

## Current Behavior

- `app/create-memory/page.tsx` builds fragments from wizard answers and inserts non-empty items into `memory_fragments` with `memory_id`, `source_type`, and `content`.
- `app/memory-chat/[id]/page.tsx` loads up to 6 recent fragments for the active memory with `select("content, source_type")`, filtered by `memory_id`, ordered by `created_at` descending.
- `app/api/memory-chat/route.ts` loads up to 30 recent fragments with `select("source_type, content")`, filtered by `body.memory_id`, ordered by `created_at` descending, then converts them into labeled prompt text.
- No code path found currently updates or deletes `memory_fragments`.

## Risks

- `memory_fragments` is still accessed directly from page and API code instead of through a Feature/Domain service.
- Fragment insertion in `app/create-memory/page.tsx` is separate from Memory creation, so a Memory can be created without fragments if fragment insert fails.
- API prompt labels in `app/api/memory-chat/route.ts` do not fully match inserted `source_type` values: `anger_style` and `comfort_style` fall back to the generic label.
- Reads rely on `created_at` existing and being populated by the database, but this task did not verify schema defaults.
- There is no centralized validation for allowed `source_type` values or non-empty `content` beyond the create page filter.

## Recommended Next Step

Create a dedicated Memory Fragment Domain under `features/` with service, repository, datasource, and types. Then migrate fragment creation and reads behind API routes so pages and AI routes do not directly call `supabase.from("memory_fragments")`.
