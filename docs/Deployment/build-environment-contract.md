# Build Environment Contract

## Required invariant

`npm run build` must complete with all Supabase, PostgreSQL, AI provider, and COS credentials absent. CI must not inject fake keys to hide module-level client initialization.

Next.js imports route and page modules while collecting build metadata. Therefore modules may declare types, constants, factories, and lazy proxies, but they must not create database, network, AI, or object-storage clients at import time.

## Runtime-only configuration

The following values are runtime secrets or runtime deployment configuration. They are loaded only when a request invokes the corresponding service:

- `DATABASE_URL` and PostgreSQL pool settings
- AI provider credentials such as `DEEPSEEK_API_KEY`, `VOLC_API_KEY`, and `OPENAI_API_KEY`
- COS credentials and bucket settings
- `LEGACY_SUPABASE_URL` and `LEGACY_SUPABASE_SERVICE_ROLE_KEY` for explicitly isolated historical routes only

Formal China production memory, conversation, and media paths use PostgreSQL and COS through their existing Service/Repository/provider boundaries. Legacy Supabase migration documentation remains historical input and does not make Supabase a formal production dependency.

## Legacy route behavior

Legacy routes must be visibly isolated and fail closed. They must not fall back to public Supabase variables, expose missing configuration names, or return fabricated success. `/api/collective-analysis` depends on a Supabase-only historical table that has no approved PostgreSQL migration, so it returns a controlled `503 COLLECTIVE_ANALYSIS_UNAVAILABLE` until a dedicated PostgreSQL repository and data migration are approved.

## CI acceptance

Before build, remove inherited values for Supabase, `DATABASE_URL`, all AI providers, and COS. Run the standard command without substitutions:

```bash
npm run build
```

Any credential error, database connection, or external network request during this command is a release blocker.
