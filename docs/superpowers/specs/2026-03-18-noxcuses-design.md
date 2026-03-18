# NoXcuses — v1 Design Spec
Date: 2026-03-18

## 1. Overview

NoXcuses is a science-based beginner bodybuilding coach app. It uses a chat-first interface backed by a multi-agent AI system to guide beginner lifters from nothing to a structured workout plan, then checks in on progress over time. All recommendations are natural bodybuilding-aligned, evidence-aware, and auditable.

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React, Tailwind CSS |
| Backend | Next.js API Routes |
| Database + Auth | Supabase (PostgreSQL + Auth + Storage) |
| AI | OpenAI GPT-4o via `AIProvider` interface |
| Deployment | Vercel |
| Language | TypeScript throughout |

## 3. Architecture

```
┌─────────────────────────────────────────┐
│           Next.js App (Vercel)          │
│                                         │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │  React UI    │  │   API Routes     │ │
│  │  - Dashboard │  │  /api/chat       │ │
│  │  - Chat      │  │  /api/onboard    │ │
│  │  - Workouts  │  │  /api/workouts   │ │
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

### Provider Abstraction

All agents depend on the `AIProvider` interface. Switching from OpenAI to another provider (e.g., Anthropic Claude) is a config change, not a code change.

```typescript
interface AIProvider {
  complete(messages: Message[], options: CompletionOptions): Promise<string>
  stream(messages: Message[], options: CompletionOptions): AsyncIterable<string>
}

class OpenAIProvider implements AIProvider { ... }
class ClaudeProvider implements AIProvider { ... }
```

## 4. Agent System

### Agent Roles

| Agent | Responsibility |
|---|---|
| **Head Coach** | Orchestrates all agents, owns conversation, assembles final response |
| **Safety** | Guardrails — runs on every message, can veto unsafe output |
| **Researcher** | Summarizes exercise science rationale on demand |
| **Diet** | Calorie, protein, and macro targets |
| **Medical Expert** | Detects red flags, defers to professional help |
| **Exercise Subagents** | Recommend specific exercises with YouTube links |

### Request Lifecycle

```
User message
     │
     ▼
Head Coach (GPT-4o)
     │
     ├──► Safety Agent — always runs first, can veto or flag
     │
     ├──► (if training question) Exercise Subagent
     │         └─► returns exercises + YouTube links
     │
     ├──► (if nutrition question) Diet Agent
     │
     ├──► (if science rationale needed) Researcher Agent
     │
     ├──► (if red flag detected) Medical Expert Agent
     │         └─► returns "consult a professional" language
     │
     └──► Head Coach assembles final response → saved to messages table
```

### Agent Rules
- Safety agent runs on **every** message — cannot be skipped
- Head Coach has final say on wording but cannot override a Safety veto
- Agents return structured JSON to the Head Coach, not free text
- All agent inputs and outputs are logged (auditable)
- YouTube links: curated list first, fallback to YouTube search URL

## 5. Database Schema

| Table | Key Columns |
|---|---|
| `users` | id, email, created_at (Supabase Auth managed) |
| `profiles` | user_id, sex, height_cm, weight_kg, training_age, goal, equipment, limitations, onboarding_complete |
| `conversations` | id, user_id, created_at, context_type (onboarding / coaching) |
| `messages` | id, conversation_id, role (user/assistant/agent), content, agent_name, created_at |
| `workouts` | id, user_id, plan_data (JSON), generated_at, status (active/archived) |
| `workout_logs` | id, user_id, workout_id, date, exercises (JSON), notes, bodyweight |
| `progress_photos` | id, user_id, storage_url, taken_at |

- `plan_data` and `exercises` stored as JSON for v1 flexibility
- Supabase Row-Level Security (RLS) enforced — users access only their own data
- Supabase Auth handles passwords, sessions, and JWTs

## 6. Onboarding Flow

Onboarding is a guardrailed chat. The Head Coach is locked to profile collection until complete. Off-topic messages are politely redirected.

```
1. Welcome message — explain what the app does
2. Ask goal → suggest options if user is vague
3. Ask sex
4. Ask height + weight
5. Ask training age (never / <6mo / 6mo–2yr / 2yr+)
6. Ask equipment (full gym / dumbbells / home / bodyweight)
7. Ask schedule (days/week available)
8. Ask limitations ("any injuries or movements to avoid?") — non-medical framing
9. Optional: upload a progress photo
10. Show summary card → "Here's what I know about you — does this look right?"
11. Generate first workout plan + nutrition targets
12. Unlock full dashboard
```

**Guardrail rule:** Safety agent intercepts off-topic messages during onboarding and redirects politely. Example: "Great question — I'll cover that after we finish setting up your plan."

**Photos:** Optional, stored in Supabase Storage, not analyzed by AI in v1.

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

### Chat Behavior
- Streaming responses (text appears word by word)
- Agent name shown subtly when subagent contributes (e.g., *"via Exercise Coach"*)
- Workout cards appear inline in chat — structured, not plain text
- Users can log workouts conversationally through chat

### Workout Card Format (inline in chat)
```
┌─────────────────────────────────┐
│  Barbell Squat                  │
│  3 sets × 5 reps  │  Rest: 3min │
│  [▶ Watch on YouTube]           │
└─────────────────────────────────┘
```

### v1 Scope Boundary
All changes happen through chat. Dashboard views (plan, progress, nutrition) are read-only in v1.

## 8. Error Handling

| Scenario | Behavior |
|---|---|
| OpenAI timeout / outage | "Coach is temporarily unavailable, try again in a moment" |
| Safety veto | Polite redirect shown to user; veto reason logged, not shown |
| Invalid onboarding input | Coach asks again conversationally |
| Auth error | Redirect to login; session auto-refreshes via Supabase |

## 9. Testing Priorities

- Unit tests for Safety agent — assert it catches unsafe advice (extreme cuts, PED references, injury prescriptions)
- Unit tests for recommendation logic — calorie targets, progression rules, volume caps
- Integration tests for onboarding flow — assert profile is correctly built from conversation
- Agents are mocked in tests — tests verify orchestration logic, not model output

## 10. Out of Scope for v1

- RAG / vector search (designed for, not built)
- Push notifications
- Mobile app (planned for later via React Native or Capacitor)
- Advanced progress analytics
- Social / community features
- Paid tier / billing

## 11. Mobile Path

The backend is a standard API. Porting to iPhone later means:
- React Native frontend calling the same endpoints, or
- Capacitor wrapping the web app in a native shell

Estimated effort after v1 is stable: 2–4 weeks.
