# Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the NoXcuses Next.js app with Supabase auth, database schema, and the AIProvider abstraction layer so every subsequent plan has a working foundation to build on.

**Architecture:** Next.js 14 App Router monolith deployed to Vercel. Supabase handles auth (email+password), PostgreSQL database, and file storage. An `AIProvider` interface abstracts all LLM calls so OpenAI can be swapped without touching agent code. The Safety agent is also wired up in this plan as a shared dependency.

**Tech Stack:** Next.js 14, React 18, Tailwind CSS, Supabase (JS client v2), OpenAI SDK v4, TypeScript 5, Vitest, `@testing-library/react`

---

## File Map

```
noxcuses/
├── app/
│   ├── layout.tsx                  # Root layout, Tailwind, fonts
│   ├── page.tsx                    # Landing page (unauthenticated)
│   ├── (auth)/
│   │   ├── login/page.tsx          # Login form
│   │   └── signup/page.tsx         # Signup form
│   └── dashboard/
│       └── layout.tsx              # Dashboard shell (auth-protected)
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser Supabase client (singleton)
│   │   └── server.ts               # Server Supabase client (cookies)
│   ├── ai/
│   │   ├── types.ts                # Message, CompletionOptions, AIProvider interface
│   │   ├── openai-provider.ts      # OpenAIProvider implements AIProvider
│   │   └── provider.ts             # Singleton: reads AI_PROVIDER env var, returns provider
│   └── agents/
│       └── safety.ts               # SafetyAgent: hard stops + LLM classification
├── middleware.ts                   # Auth enforcement on /api/* and /dashboard/*
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # All tables from spec
├── tests/
│   └── agents/
│       └── safety.test.ts          # Safety agent unit tests
├── .env.local.example              # Required env vars documented
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `vitest.config.ts`, `next.config.ts`
- Create: `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1: Bootstrap the project**

```bash
npx create-next-app@latest noxcuses \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*"
cd noxcuses
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr openai ai
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Create `tests/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Create env example file**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_api_key
AI_PROVIDER=openai
```

Copy it: `cp .env.local.example .env.local` and fill in real values.

- [ ] **Step 6: Replace app/page.tsx with landing placeholder**

```typescript
export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">NoXcuses</h1>
      <p className="text-gray-600 mb-8">Your science-based bodybuilding coach.</p>
      <div className="flex gap-4">
        <a href="/login" className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800">
          Log in
        </a>
        <a href="/signup" className="px-6 py-2 border border-black rounded-lg hover:bg-gray-50">
          Sign up
        </a>
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Verify the app starts**

```bash
npm run dev
```

Expected: App loads at http://localhost:3000 with "NoXcuses" heading. No errors in terminal.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Tailwind and Vitest"
```

---

## Task 2: Supabase Clients

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`

- [ ] **Step 1: Create browser client**

Create `lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Create server client**

Create `lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/
git commit -m "feat: add Supabase browser and server clients"
```

---

## Task 3: Database Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com → New project. Copy the project URL and anon key into `.env.local`.

- [ ] **Step 2: Write migration**

Create `supabase/migrations/001_initial_schema.sql`:
```sql
-- Enable UUID generation
create extension if not exists "pgcrypto";

-- profiles
create table profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade unique,
  age_bracket         text check (age_bracket in ('under_16', '16_17', '18_plus')),
  sex                 text check (sex in ('male', 'female', 'other')),
  height_cm           integer check (height_cm between 100 and 250),
  weight_kg           numeric(5,1) check (weight_kg between 30 and 300),
  training_age        text check (training_age in ('none', 'under_6mo', '6mo_2yr', 'over_2yr')),
  goal                text check (goal in ('muscle_gain', 'fat_loss', 'recomposition', 'general_fitness')),
  equipment           text check (equipment in ('full_gym', 'dumbbells', 'home', 'bodyweight')),
  days_per_week       integer check (days_per_week between 1 and 7),
  limitations         text,
  onboarding_state    text check (onboarding_state in (
                        'WELCOME', 'AGE_BRACKET', 'GOAL', 'SEX', 'HEIGHT_WEIGHT',
                        'TRAINING_AGE', 'EQUIPMENT', 'SCHEDULE', 'LIMITATIONS',
                        'PHOTO_OFFER', 'SUMMARY', 'PLAN_GENERATION', 'COMPLETE'
                      )) default 'WELCOME',
  onboarding_complete boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- conversations
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  context_type  text check (context_type in ('onboarding', 'coaching')),
  created_at    timestamptz default now()
);

-- messages
create table messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references conversations(id) on delete cascade,
  role             text check (role in ('user', 'assistant', 'agent')),
  content          text not null,
  agent_name       text,
  agent_input      jsonb,
  agent_output     jsonb,
  created_at       timestamptz default now()
);

-- workouts
create table workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  plan_data     jsonb not null,
  generated_at  timestamptz default now(),
  status        text check (status in ('active', 'archived')) default 'active'
);

-- workout_logs
create table workout_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  workout_id  uuid references workouts(id),
  date        date not null,
  exercises   jsonb not null,
  notes       text,
  bodyweight  numeric(5,1),
  created_at  timestamptz default now()
);

-- progress_photos
create table progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  storage_url  text not null,
  taken_at     date not null,
  created_at   timestamptz default now()
);

-- exercises (curated library)
create table exercises (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  muscle_group text not null,
  equipment    text not null,
  youtube_url  text not null,
  difficulty   text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  notes        text
);

-- Row Level Security
alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table workouts enable row level security;
alter table workout_logs enable row level security;
alter table progress_photos enable row level security;
alter table exercises enable row level security;

-- RLS policies: users access only their own rows
create policy "Users own their profile"
  on profiles for all using (auth.uid() = user_id);

create policy "Users own their conversations"
  on conversations for all using (auth.uid() = user_id);

create policy "Users own their messages"
  on messages for all
  using (conversation_id in (
    select id from conversations where user_id = auth.uid()
  ));

create policy "Users own their workouts"
  on workouts for all using (auth.uid() = user_id);

create policy "Users own their workout logs"
  on workout_logs for all using (auth.uid() = user_id);

create policy "Users own their progress photos"
  on progress_photos for all using (auth.uid() = user_id);

create policy "Exercises are readable by authenticated users"
  on exercises for select using (auth.role() = 'authenticated');
```

- [ ] **Step 3: Run the migration in Supabase**

Go to your Supabase project → SQL Editor → paste the migration → Run.

Expected: All tables created with no errors.

- [ ] **Step 4: Verify tables exist**

In Supabase → Table Editor: confirm all 7 tables are visible.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: add initial database schema with RLS"
```

---

## Task 4: Auth Middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Write middleware**

Create `middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isProtected =
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/api/')

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
```

- [ ] **Step 2: Verify middleware runs**

```bash
npm run dev
```

Navigate to http://localhost:3000/dashboard. Expected: redirect to /login.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add auth middleware protecting dashboard and api routes"
```

---

## Task 5: Auth Pages

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`
- Create: `app/(auth)/login/actions.ts`
- Create: `app/(auth)/signup/actions.ts`

- [ ] **Step 1: Write login server action**

Create `app/(auth)/login/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) return { error: error.message }

  redirect('/dashboard')
}
```

- [ ] **Step 2: Write login page**

Create `app/(auth)/login/page.tsx`:
```typescript
import { login } from './actions'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">Log in</h1>
        <form action={login} className="flex flex-col gap-4">
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="border rounded-lg px-4 py-2"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            className="border rounded-lg px-4 py-2"
          />
          <button
            type="submit"
            className="bg-black text-white rounded-lg px-4 py-2 hover:bg-gray-800"
          >
            Log in
          </button>
        </form>
        <p className="mt-4 text-sm text-gray-600">
          No account? <a href="/signup" className="underline">Sign up</a>
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Write signup server action**

Create `app/(auth)/signup/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) return { error: error.message }

  redirect('/dashboard')
}
```

- [ ] **Step 4: Write signup page**

Create `app/(auth)/signup/page.tsx`:
```typescript
import { signup } from './actions'

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">Create account</h1>
        <form action={signup} className="flex flex-col gap-4">
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="border rounded-lg px-4 py-2"
          />
          <input
            name="password"
            type="password"
            placeholder="Password (min 6 chars)"
            minLength={6}
            required
            className="border rounded-lg px-4 py-2"
          />
          <button
            type="submit"
            className="bg-black text-white rounded-lg px-4 py-2 hover:bg-gray-800"
          >
            Sign up
          </button>
        </form>
        <p className="mt-4 text-sm text-gray-600">
          Already have an account? <a href="/login" className="underline">Log in</a>
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Create dashboard shell (placeholder)**

Create `app/dashboard/layout.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex">
      <aside className="w-48 border-r p-4 flex flex-col gap-2">
        <span className="font-bold text-lg mb-4">NoXcuses</span>
        <a href="/dashboard/chat" className="hover:underline">Chat</a>
        <a href="/dashboard/plan" className="hover:underline">My Plan</a>
        <a href="/dashboard/chat?intent=log" className="hover:underline">Log Workout</a>
        <a href="/dashboard/progress" className="hover:underline">Progress</a>
        <a href="/dashboard/nutrition" className="hover:underline">Nutrition</a>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
```

Create `app/dashboard/page.tsx`:
```typescript
import { redirect } from 'next/navigation'

export default function DashboardPage() {
  redirect('/dashboard/chat')
}
```

- [ ] **Step 6: Smoke test auth flow manually**

```bash
npm run dev
```

1. Go to http://localhost:3000/signup → create a test account
2. Expected: redirect to /dashboard (shows sidebar shell)
3. Go to http://localhost:3000/login → log in with same account
4. Expected: redirect to /dashboard

- [ ] **Step 7: Commit**

```bash
git add app/
git commit -m "feat: add login, signup pages and dashboard shell"
```

---

## Task 6: AIProvider Interface + OpenAI Implementation

**Files:**
- Create: `lib/ai/types.ts`
- Create: `lib/ai/openai-provider.ts`
- Create: `lib/ai/provider.ts`

- [ ] **Step 1: Write a failing test**

Create `tests/ai/provider.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the provider singleton returns an object with complete() and stream()
describe('getProvider', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns a provider with complete and stream methods', async () => {
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'test-key'
    const { getProvider } = await import('@/lib/ai/provider')
    const provider = getProvider()
    expect(typeof provider.complete).toBe('function')
    expect(typeof provider.stream).toBe('function')
  })

  it('throws if AI_PROVIDER env var is unrecognized', async () => {
    process.env.AI_PROVIDER = 'unknown'
    const { getProvider } = await import('@/lib/ai/provider')
    expect(() => getProvider()).toThrow('Unknown AI_PROVIDER: unknown')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:run -- tests/ai/provider.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/ai/provider'`

- [ ] **Step 3: Define types**

Create `lib/ai/types.ts`:
```typescript
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface CompletionOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface AIProvider {
  complete(messages: Message[], options?: CompletionOptions): Promise<string>
  stream(messages: Message[], options?: CompletionOptions): ReadableStream<string>
}
```

- [ ] **Step 4: Write OpenAI provider**

Create `lib/ai/openai-provider.ts`:
```typescript
import OpenAI from 'openai'
import type { AIProvider, Message, CompletionOptions } from './types'

export class OpenAIProvider implements AIProvider {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<string> {
    const allMessages = options.systemPrompt
      ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
      : messages

    const response = await this.client.chat.completions.create({
      model: options.model ?? 'gpt-4o',
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      messages: allMessages,
    })

    return response.choices[0].message.content ?? ''
  }

  stream(messages: Message[], options: CompletionOptions = {}): ReadableStream<string> {
    const client = this.client
    const allMessages = options.systemPrompt
      ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
      : messages

    return new ReadableStream({
      async start(controller) {
        const stream = await client.chat.completions.create({
          model: options.model ?? 'gpt-4o',
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          messages: allMessages,
          stream: true,
        })

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) controller.enqueue(text)
        }
        controller.close()
      },
    })
  }
}
```

- [ ] **Step 5: Write provider singleton**

Create `lib/ai/provider.ts`:
```typescript
import type { AIProvider } from './types'
import { OpenAIProvider } from './openai-provider'

let instance: AIProvider | null = null

export function getProvider(): AIProvider {
  if (instance) return instance

  const name = process.env.AI_PROVIDER ?? 'openai'

  if (name === 'openai') {
    instance = new OpenAIProvider()
    return instance
  }

  throw new Error(`Unknown AI_PROVIDER: ${name}`)
}
```

- [ ] **Step 6: Run test — expect PASS**

```bash
npm run test:run -- tests/ai/provider.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add lib/ai/ tests/ai/
git commit -m "feat: add AIProvider interface with OpenAI implementation"
```

---

## Task 7: Safety Agent

**Files:**
- Create: `lib/agents/safety.ts`
- Create: `tests/agents/safety.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/agents/safety.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { SafetyAgent } from '@/lib/agents/safety'
import type { AIProvider } from '@/lib/ai/types'

// Mock provider — Safety LLM classification path
function mockProvider(safe: boolean): AIProvider {
  return {
    complete: vi.fn().mockResolvedValue(
      JSON.stringify({ safe, reason: safe ? null : 'reckless advice' })
    ),
    stream: vi.fn(),
  } as unknown as AIProvider
}

describe('SafetyAgent — hard stops (no LLM called)', () => {
  const agent = new SafetyAgent(mockProvider(true))

  it('blocks eating disorder language', async () => {
    const result = await agent.check('I want to eat 500 calories a day')
    expect(result.safe).toBe(false)
    expect(result.vetoMessage).toBeTruthy()
  })

  it('blocks medical diagnosis requests', async () => {
    const result = await agent.check('Do I have a torn rotator cuff?')
    expect(result.safe).toBe(false)
  })

  it('blocks crisis language', async () => {
    const result = await agent.check('I want to hurt myself')
    expect(result.safe).toBe(false)
  })

  it('blocks under-16 indicators', async () => {
    const result = await agent.check('I am 14 years old')
    expect(result.safe).toBe(false)
  })
})

describe('SafetyAgent — safe messages pass to LLM classification', () => {
  it('passes a normal training question', async () => {
    const provider = mockProvider(true)
    const agent = new SafetyAgent(provider)
    const result = await agent.check('How many sets should I do for chest?')
    expect(result.safe).toBe(true)
    expect(provider.complete).toHaveBeenCalledOnce()
  })

  it('vetoes reckless advice via LLM classification', async () => {
    const provider = mockProvider(false)
    const agent = new SafetyAgent(provider)
    const result = await agent.check('I want to lose 10kg in 2 weeks')
    expect(result.safe).toBe(false)
    expect(result.vetoMessage).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:run -- tests/agents/safety.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/agents/safety'`

- [ ] **Step 3: Implement SafetyAgent**

Create `lib/agents/safety.ts`:
```typescript
import type { AIProvider } from '@/lib/ai/types'

export interface SafetyResult {
  safe: boolean
  reason?: string
  vetoMessage?: string
}

// Patterns checked deterministically — no LLM call
const HARD_STOP_PATTERNS: Array<{ pattern: RegExp; reason: string; message: string }> = [
  {
    pattern: /\b(500|600|700|800|900)\s*cal(orie)?s?\b|eating disorder|anorexia|bulimia|starv/i,
    reason: 'eating_disorder_or_extreme_restriction',
    message: "I'm not able to help with extreme calorie restriction or eating disorder topics. Please speak with a registered dietitian or healthcare professional.",
  },
  {
    pattern: /diagnos|do i have|is it (a |an )?(torn|broken|fractured|sprained)|what injury/i,
    reason: 'medical_diagnosis_request',
    message: "I can't diagnose injuries or medical conditions. Please consult a doctor or physiotherapist.",
  },
  {
    pattern: /hurt myself|kill myself|suicide|self.harm|end my life/i,
    reason: 'crisis_language',
    message: "It sounds like you might be going through a really difficult time. Please reach out to a crisis helpline — in the US: 988 (Suicide & Crisis Lifeline).",
  },
  {
    pattern: /\bi('m| am) (1[0-5]|[1-9]) (years? old|yo\b)/i,
    reason: 'minor_indicator',
    message: "This app is designed for users 16 and older.",
  },
]

const SAFETY_SYSTEM_PROMPT = `You are a safety classifier for a bodybuilding coaching app.
Evaluate the user message for unsafe content. Respond ONLY with JSON:
{"safe": true} or {"safe": false, "reason": "<short reason>"}

Flag as unsafe if the message requests:
- Medically unsafe training (e.g. training through sharp/acute pain)
- Weight loss faster than 2.5% of bodyweight per week
- Bypassing beginner guardrails for dangerous advanced methods

Do NOT flag normal training questions, nutrition questions, or progress questions.`

export class SafetyAgent {
  constructor(private provider: AIProvider) {}

  async check(userMessage: string): Promise<SafetyResult> {
    // Hard stops — deterministic, no LLM
    for (const { pattern, reason, message } of HARD_STOP_PATTERNS) {
      if (pattern.test(userMessage)) {
        return { safe: false, reason, vetoMessage: message }
      }
    }

    // LLM classification
    const raw = await this.provider.complete(
      [{ role: 'user', content: userMessage }],
      { systemPrompt: SAFETY_SYSTEM_PROMPT, temperature: 0, model: 'gpt-4o-mini' }
    )

    let parsed: { safe: boolean; reason?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      // If we can't parse the safety check, default to safe to avoid blocking users on LLM errors
      return { safe: true }
    }

    if (!parsed.safe) {
      return {
        safe: false,
        reason: parsed.reason,
        vetoMessage: "That's outside what I can safely advise — here's what I can help with instead: training plans, exercise selection, nutrition targets, and recovery guidance.",
      }
    }

    return { safe: true }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:run -- tests/agents/safety.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/agents/ tests/agents/
git commit -m "feat: add Safety agent with hard stops and LLM classification"
```

---

## Task 8: Smoke Test + Final Verification

- [ ] **Step 1: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass. No failures.

- [ ] **Step 2: Build the app**

```bash
npm run build
```

Expected: Build completes with no TypeScript errors.

- [ ] **Step 3: Manual end-to-end smoke test**

```bash
npm run dev
```

1. Visit http://localhost:3000 → see landing page with Log in / Sign up buttons
2. Click Sign up → create account → land on /dashboard (sidebar visible)
3. Click Log in → log in with same account → land on /dashboard
4. Visit http://localhost:3000/dashboard in a private window (no session) → redirect to /login

All 4 steps should work without errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: plan 1 complete — foundation verified"
```

---

## What's Next

Plan 2 builds the onboarding chat on top of this foundation:
- Onboarding state machine (`/api/onboard` route)
- Chat UI for onboarding
- Profile creation and state persistence
- Age gate (terminates flow for under-16)
- Plan generation trigger
