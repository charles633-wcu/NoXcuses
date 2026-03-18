# NoXcuses — v1 Design Spec
Date: 2026-03-18

## 1. Overview

NoXcuses is a science-based beginner bodybuilding coach app. It uses a chat-first interface backed by a multi-agent AI system to guide beginner lifters from nothing to a structured workout plan, then checks in on progress over time. All recommendations are natural bodybuilding-aligned, evidence-aware, and auditable.

**Definition of beginner:** A user with fewer than 2 years of consistent, structured training. Users with more experience can onboard but the product is not optimized for them in v1.

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React, Tailwind CSS |
| Backend | Next.js API Route Handlers + Server Actions |
| AI Streaming | Vercel AI SDK (`useChat`, `streamText`) |
| Database + Auth | Supabase (PostgreSQL + Auth + Storage) |
| AI | OpenAI GPT-4o via `AIProvider` interface |
| Deployment | Vercel |
| Language | TypeScript throughout |
| Testing | Vitest (unit), Playwright (e2e) |

## 3. Architecture

```
┌─────────────────────────────────────────┐
│           Next.js App (Vercel)          │
│                                         │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │  React UI    │  │   API Routes     │ │
│  │  - Dashboard │  │  POST /api/chat  │ │
│  │  - Chat      │  │  POST /api/onboard│ │
│  │  - Workouts  │  │  GET  /api/plan  │ │
│  └──────────────┘  └────────┬─────────┘ │
└─────────────────────────────┼───────────┘
                              │
                    ┌─────────▼──────────┐
                    │   Agent Orchestra  │
                    │   (Head Coach)     │
                    │  ┌──────────────┐  │
                    │  │  Researcher  │  │
                    │  │  Safety      │  │
                    │  │  Diet        │  │
                    │  │  Medical     │  │
                    │  │  Exercise    │  │
                    │  └──────────────┘  │
                    │  AIProvider iface  │
                    └─────────┬──────────┘
                              │
               ┌──────────────┴──────────────┐
               │          Supabase           │
               │  - Auth (users)             │
               │  - DB (profiles, workouts,  │
               │    messages, plans)         │
               │  - Storage (progress photos)│
               └─────────────────────────────┘
```

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Main coaching chat (streaming) |
| `/api/onboard` | POST | Onboarding chat (streaming, guardrailed) |
| `/api/plan` | GET | Fetch active workout plan |
| `/api/workout-log` | POST | Log a completed workout |
| `/api/profile` | GET/PATCH | Read or update user profile |

All routes require a valid Supabase session cookie. Unauthenticated requests return 401. Middleware enforces auth on all `/api/*` and `/dashboard/*` routes.

### AIProvider Interface

```typescript
interface CompletionOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface AIProvider {
  complete(messages: Message[], options?: CompletionOptions): Promise<string>
  stream(messages: Message[], options?: CompletionOptions): ReadableStream<string>
}

// Implementations
class OpenAIProvider implements AIProvider { ... }
class ClaudeProvider implements AIProvider { ... }  // ready when needed

// Singleton selected by env var: AI_PROVIDER=openai|claude
```

## 4. Agent System

### Agent Roles

| Agent | Responsibility |
|---|---|
| **Head Coach** | Orchestrates all agents, owns conversation, assembles final response |
| **Safety** | Guardrails — runs pre-flight on every user message, can hard-stop before any LLM call |
| **Researcher** | Summarizes exercise science rationale on demand |
| **Diet** | Calorie, protein, and macro targets |
| **Medical Expert** | Detects red flags, returns professional-referral language |
| **Exercise Subagents** | Recommend specific exercises with YouTube links |

### Agent JSON Contracts

Each subagent returns a typed result to the Head Coach:

```typescript
// Safety agent
interface SafetyResult {
  safe: boolean
  reason?: string       // logged, not shown to user
  vetoMessage?: string  // shown to user if safe === false
}

// Exercise agent
interface ExerciseResult {
  exercises: Array<{
    name: string
    sets: number
    reps: string        // e.g. "6-8" or "5"
    restSeconds: number
    youtubeUrl: string
    cues: string[]      // 2-3 coaching cues
  }>
}

// Diet agent
interface DietResult {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  rationale: string
}

// Researcher agent
interface ResearchResult {
  claim: string
  source: string
  confidence: 'high' | 'moderate' | 'low'
  notes?: string
}

// Medical expert agent
interface MedicalResult {
  flagged: boolean
  referralMessage?: string  // shown to user if flagged
}

// Workout plan (stored in workouts.plan_data)
interface WorkoutPlan {
  daysPerWeek: number
  days: Array<{
    label: string           // e.g. "Day A", "Push Day"
    focus: string           // e.g. "Upper body", "Full body"
    exercises: Array<{
      name: string
      sets: number
      reps: string          // e.g. "6-8" or "5"
      restSeconds: number
      youtubeUrl: string
      cues: string[]
    }>
  }>
  notes: string             // overall plan rationale
  generatedAt: string       // ISO timestamp
}
```

### Request Lifecycle & Sequencing

Agents run **sequentially** in v1 (not in parallel) to keep orchestration simple and debuggable.

```
1. Safety agent runs on raw user message (pre-flight, before any LLM call)
   └─► if safe === false: return vetoMessage immediately, log reason, abort
   └─► if safe === true: continue

2. Head Coach (LLM) reads message + conversation history, decides which subagents to invoke
   (Decision is deterministic routing for onboarding; LLM reasoning for coaching)

3. Subagents invoked based on Head Coach decision:
   - Exercise agent if training question
   - Diet agent if nutrition question
   - Researcher agent if "why" question
   - Medical Expert agent if red flag keyword detected

4. Head Coach assembles subagent results into final response

5. Response streamed to client via Vercel AI SDK

6. Full exchange (user message + agent calls + final response) saved to messages table
```

### Safety Agent — Trigger Categories

The Safety agent is a deterministic rule check + lightweight LLM classification. Hard-coded rules fire first (no LLM call needed):

**Hard stops (no LLM):**
- Mentions of PEDs, steroids, SARMs, or banned substances
- Explicit mentions of eating disorders or extreme restriction (< 1000 kcal/day)
- Requests for medical diagnosis or injury treatment
- Content indicating user may be a minor (under 16)
- Suicide, self-harm, or crisis language → redirect to crisis resources

**LLM classification (if no hard stop):**
- Medically unsafe training advice (e.g., "train through sharp pain")
- Reckless cutting advice (> 1.5% bodyweight/week loss targets)
- Requests to bypass beginner guardrails ("give me an advanced powerlifter program")

**Veto response behavior:**
- Hard stop: return a fixed canned message, log the trigger category, do not call Head Coach
- LLM classification veto: return a polite redirect ("That's outside what I can safely advise — here's what I can help with instead"), log reason
- Partial streams: Safety runs **before** streaming begins. No mid-stream abort needed.

### Streaming vs. Safety — Architecture Decision

Safety runs **pre-flight** (before streaming starts). This adds ~100–200ms latency per message but eliminates mid-stream abort complexity. Acceptable trade-off for v1.

### Head Coach Routing Logic

During **onboarding**: routing is deterministic — the Head Coach follows the onboarding state machine (see Section 6), does not call subagents. One LLM call produces the response directly.

During **coaching**: the Head Coach makes **two sequential LLM calls** per message:

**Call 1 — Routing decision only:**
```json
{ "invoke": ["exercise", "diet"] }
```
The system prompt instructs the Head Coach to output only this JSON. No response text yet.

**Call 2 — Final response:**
The orchestration layer calls the indicated subagents, injects their results into the Head Coach's context, then makes a second LLM call that produces the final user-facing response. This second call is streamed to the client.

**Trade-off acknowledged:** Two LLM calls per coached message adds latency (~1–2s extra) and doubles token cost for the routing call. This is acceptable for v1 given the simplicity and debuggability it provides. In future, routing can be replaced with a smaller, faster classifier model.

## 5. Database Schema

```sql
-- Managed by Supabase Auth
users (
  id          uuid PRIMARY KEY,
  email       text UNIQUE NOT NULL,
  created_at  timestamptz DEFAULT now()
)

profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES users(id) ON DELETE CASCADE,
  age_bracket         text CHECK (age_bracket IN ('under_16', '16_17', '18_plus')),
  sex                 text CHECK (sex IN ('male', 'female', 'other')),
  height_cm           integer CHECK (height_cm BETWEEN 100 AND 250),
  weight_kg           numeric(5,1) CHECK (weight_kg BETWEEN 30 AND 300),
  training_age        text CHECK (training_age IN ('none', 'under_6mo', '6mo_2yr', 'over_2yr')),
  goal                text CHECK (goal IN ('muscle_gain', 'fat_loss', 'recomposition', 'general_fitness')),
  equipment           text CHECK (equipment IN ('full_gym', 'dumbbells', 'home', 'bodyweight')),
  days_per_week       integer CHECK (days_per_week BETWEEN 1 AND 7),
  limitations         text,         -- free text, non-medical framing
  onboarding_state    text CHECK (onboarding_state IN (
                        'WELCOME', 'AGE_BRACKET', 'GOAL', 'SEX', 'HEIGHT_WEIGHT',
                        'TRAINING_AGE', 'EQUIPMENT', 'SCHEDULE', 'LIMITATIONS',
                        'PHOTO_OFFER', 'SUMMARY', 'PLAN_GENERATION', 'COMPLETE'
                      )) DEFAULT 'WELCOME',
  onboarding_complete boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
)

conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  context_type  text CHECK (context_type IN ('onboarding', 'coaching')),
  created_at    timestamptz DEFAULT now()
)

messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid REFERENCES conversations(id) ON DELETE CASCADE,
  role             text CHECK (role IN ('user', 'assistant', 'agent')),
  content          text NOT NULL,
  agent_name       text,           -- null for user/assistant messages
  agent_input      jsonb,          -- logged for auditability
  agent_output     jsonb,          -- logged for auditability
  created_at       timestamptz DEFAULT now()
)

workouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  plan_data     jsonb NOT NULL,    -- full plan structure
  generated_at  timestamptz DEFAULT now(),
  status        text CHECK (status IN ('active', 'archived')) DEFAULT 'active'
)

workout_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  workout_id  uuid REFERENCES workouts(id),
  date        date NOT NULL,
  exercises   jsonb NOT NULL,      -- [{name, sets: [{reps, weight}]}]
  notes       text,
  bodyweight  numeric(5,1),
  created_at  timestamptz DEFAULT now()
)

progress_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  storage_url  text NOT NULL,
  taken_at     date NOT NULL,
  created_at   timestamptz DEFAULT now()
)

exercises (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  muscle_group text NOT NULL,
  equipment    text NOT NULL,
  youtube_url  text NOT NULL,      -- curated, not AI-generated
  difficulty   text CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  notes        text
)
```

**Row-Level Security:** All tables have RLS enabled. Users can only read/write their own rows.

**Progress photos:** Private to the user, stored in a private Supabase Storage bucket. Not analyzed by AI in v1. Upload limit: 10MB per photo.

## 6. Onboarding Flow — State Machine

Onboarding is a guardrailed chat. The Safety agent still runs on every message. Off-topic messages are redirected. The Head Coach does not call coaching subagents until `onboarding_complete = true`.

**States:**

```
WELCOME → AGE_BRACKET → GOAL → SEX → HEIGHT_WEIGHT → TRAINING_AGE →
EQUIPMENT → SCHEDULE → LIMITATIONS → PHOTO_OFFER →
SUMMARY → PLAN_GENERATION → COMPLETE
```

**Special case — AGE_BRACKET gate:** If the user selects `under_16`, onboarding terminates immediately with a fixed message: "This app is designed for users 16 and older. We hope to see you back soon!" No profile is created. This is a hard deterministic gate — not LLM-dependent.

**Field validation per state:**

| Field | Valid Range / Values |
|---|---|
| age_bracket | under_16, 16_17, 18_plus |
| goal | muscle_gain, fat_loss, recomposition, general_fitness (or coach suggests from free text) |
| sex | male, female, other |
| height_cm | 100–250 cm |
| weight_kg | 30–300 kg |
| training_age | none, under_6mo, 6mo_2yr, over_2yr |
| equipment | full_gym, dumbbells, home, bodyweight |
| days_per_week | 1–7 |
| limitations | free text, max 500 chars; non-medical framing enforced |

**On invalid input:** Coach asks again conversationally. No hard form errors. After 3 failed attempts at a field, coach offers a default and moves on.

**Transition to summary:** After all required fields are collected (photo is optional), coach shows a summary card and asks for confirmation. User confirms → plan generation begins.

**Plan generation:** Asynchronous. While generating, the chat shows a "Building your plan..." message. On completion, the dashboard unlocks and the coach sends a "Your plan is ready" message inline.

## 7. UI / Dashboard Layout

```
┌─────────────────────────────────────────────────┐
│  NoXcuses          [Profile]  [Settings]  [Logout]│
├────────────────┬────────────────────────────────-┤
│                │                                  │
│   Sidebar      │        Main Panel                │
│                │                                  │
│  > Chat        │  [switches between views]        │
│  > My Plan     │                                  │
│  > Log Workout │  Chat view: message thread       │
│  > Progress    │  Plan view: workout cards        │
│  > Nutrition   │  Progress view: weight chart     │
│                │  Nutrition view: macro targets   │
└────────────────┴──────────────────────────────────┘
```

### Auth & Access

- Unauthenticated users see a landing page and login/signup only
- Auth: email + password via Supabase Auth (magic link added later)
- After login, if `onboarding_complete = false` → redirect to onboarding chat
- After login, if `onboarding_complete = true` → redirect to dashboard

### Chat Behavior
- Streaming responses via Vercel AI SDK `useChat`
- Agent name shown subtly when a subagent contributes (e.g., *"via Exercise Coach"*)
- Workout cards rendered inline as React components, not plain text
- Users log workouts through chat: saying "log today's workout" opens a guided conversational flow. The Head Coach walks through each exercise, collects sets/reps/weight, then calls `POST /api/workout-log` server-side. There is no standalone Log Workout form in v1.

### Workout Card Format (inline in chat)
```
┌─────────────────────────────────┐
│  Barbell Squat                  │
│  3 sets × 5 reps  │  Rest: 3min │
│  [▶ Watch on YouTube]           │
└─────────────────────────────────┘
```

### YouTube Link Strategy
Exercise YouTube URLs come from the `exercises` table — curated, human-verified links. The AI does not generate URLs. If an exercise is not in the table, the Exercise agent falls back to a YouTube search URL: `https://www.youtube.com/results?search_query={exercise+name}+form+tutorial`.

### Read-Only Dashboard Enforcement
Dashboard views (My Plan, Progress, Nutrition) are read-only in v1. There are no mutation endpoints behind these views. The sidebar "Log Workout" link opens the Chat view pre-seeded with a log intent — it does not navigate to a separate form. All data mutations happen through chat → orchestration layer → `POST /api/workout-log` or `PATCH /api/profile`.

### Nutrition View
Displays the Diet agent output from the most recent plan: daily calories, protein (g), carbs (g), fat (g), and a one-paragraph rationale. Updated when the Head Coach calls the Diet agent.

## 8. Error Handling

| Scenario | User Experience | Logged |
|---|---|---|
| OpenAI timeout / outage | Chat shows: "Your coach is temporarily unavailable. Try again in a moment." | Yes |
| Safety hard stop | Fixed canned message shown | Yes, with trigger category |
| Safety LLM veto | Polite redirect message | Yes, with reason |
| Invalid onboarding input | Coach asks again conversationally | No |
| Auth session expired | Redirect to login | No |
| Plan generation failure | "Something went wrong building your plan. Let me try again." + retry | Yes |

## 9. Testing

**Tooling:** Vitest (unit/integration), Playwright (e2e)

**Unit tests:**
- Safety agent — assert hard stops fire on PED/ED/crisis/injury keywords
- Safety agent — assert LLM-classified vetoes fire on reckless advice samples
- Diet agent — assert calorie/macro outputs stay within safe ranges for given profiles
- Exercise agent — assert all returned exercises exist in the `exercises` table
- Onboarding state machine — assert correct state transitions and field validation

**Integration tests:**
- Full onboarding flow — assert profile is correctly built and `onboarding_complete` set
- Chat flow — assert messages are saved to DB with correct roles and agent metadata

**All agents are mocked in tests.** Tests verify orchestration logic, routing decisions, and data persistence — not model output.

## 10. Out of Scope for v1

- RAG / vector search (system is designed for it, not built yet)
- Push notifications
- Mobile app (planned post-v1 via React Native or Capacitor)
- Advanced progress analytics
- Social / community features
- Paid tier / billing
- Magic link or OAuth auth
- AI analysis of progress photos

## 11. Mobile Path

The backend is a standard HTTP API. Porting to iPhone later:
- React Native frontend calls the same endpoints, or
- Capacitor wraps the web app in a native shell

Estimated effort after v1 is stable: 2–4 weeks.
