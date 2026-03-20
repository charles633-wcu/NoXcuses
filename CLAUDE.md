# NoXcuses — Claude Code Context

## Project Overview
Personal bodybuilding coach web app. Private repo. Not open source.

## Repo Structure
```
NoXcuses/
├── noxcuses/          ← Next.js app (all app code lives here)
│   ├── app/           ← Next.js App Router pages and API routes
│   ├── lib/           ← Shared logic (AI, Supabase, agents, onboarding)
│   ├── tests/         ← Vitest unit tests
│   └── supabase/      ← Database migrations
└── docs/
    └── superpowers/
        ├── specs/     ← Design specs
        └── plans/     ← Implementation plans (one per feature)
```

## Working Directory
All development happens inside `noxcuses/`. Run all npm commands from there:
```bash
cd noxcuses
npm run dev        # Start dev server at localhost:3001
npm run test:run   # Run all tests once
npm run build      # Production build (TypeScript check)
```

## Git Workflow
- Work on feature branches, NOT on master directly
- Current active branch: `plan-1-foundation`
- Remote: https://github.com/charles633-wcu/NoXcuses (private)
- Do NOT use git worktrees — work directly in this folder

## Plans
Implementation is driven by numbered plans in `docs/superpowers/plans/`.
Always use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to execute a plan.

**Completed:**
- Plan 1 (Foundation) — scaffold, auth, DB schema, AIProvider, SafetyAgent ✅

**Next to execute:**
- Plan 2 (Onboarding Chat) — `docs/superpowers/plans/2026-03-18-plan-2-onboarding-chat.md`

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS |
| Database + Auth | Supabase (PostgreSQL + Auth) |
| AI Streaming | Vercel AI SDK v6 (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`) |
| LLM | OpenAI GPT-4o via AIProvider abstraction |
| Testing | Vitest + @testing-library/react |
| Language | TypeScript 5 |

## Critical AI SDK v6 Notes
The project uses `ai` v6 (a significant API change from v3/v4):
- `useChat` is from `@ai-sdk/react` — NOT `ai/react`
- `useChat` returns `sendMessage({ text })` — NOT `handleSubmit`/`handleInputChange`
- `UIMessage` has `parts` — NOT `content`
- `createUIMessageStream` execute receives `{ writer }` — destructure it
- `convertToModelMessages` is **async** — always `await` it
- Streaming: `writer.merge(result.toUIMessageStream())` inside `createUIMessageStream`

## Environment Variables
Copy `noxcuses/.env.local.example` to `noxcuses/.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   (not needed yet)
OPENAI_API_KEY=
AI_PROVIDER=openai
```
