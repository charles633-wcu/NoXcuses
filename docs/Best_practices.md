# Development Best Practices

## Planning
- Every feature starts with a plan in `docs/superpowers/plans/YYYY-MM-DD-feature-name.md`
- Plans go through a review loop before execution (use the plan-document-reviewer agent)
- Always read the spec (`docs/superpowers/specs/`) before writing a plan

## Coding
- **TDD for all agents and business logic** — write failing test first, then implement
- **No TDD required for** thin Supabase wrappers, React UI components, or config files
- Keep files small and focused — one clear responsibility per file
- Use the `AIProvider` interface for all LLM calls (never import OpenAI directly in agents)
- Server actions and API routes must not return objects — use `redirect()` for errors

## Testing
Run from `noxcuses/`:
```bash
npm run test:run          # Run all tests once
npm run test:run -- tests/path/file.test.ts  # Run a specific file
npm test                  # Watch mode
```

## Git
- Never commit to `master` directly
- One branch per plan: `plan-1-foundation`, `plan-2-onboarding`, etc.
- Commit at the end of each task (not each step)
- Commit messages: `feat:`, `fix:`, `chore:`, `docs:`
- Push to GitHub when plan is complete, then open a PR into master

## Supabase
- All schema changes go in `noxcuses/supabase/migrations/` as numbered SQL files
- Run migrations manually in the Supabase SQL Editor (no CLI needed yet)
- All tables have RLS enabled — users can only access their own rows
- Never disable RLS or use the service role key client-side

## AI SDK v6 Patterns
```typescript
// Correct streaming route pattern
const stream = createUIMessageStream({
  execute: async ({ writer }) => {           // ← destructure { writer }
    const modelMessages = await convertToModelMessages(messages)  // ← await!
    const result = streamText({ model, messages: modelMessages, ... })
    writer.merge(result.toUIMessageStream())
  }
})
return createUIMessageStreamResponse({ stream })

// Correct canned response pattern
function cannedResponse(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = crypto.randomUUID()
      writer.write({ type: 'text-start', id })
      writer.write({ type: 'text-delta', id, delta: text })
      writer.write({ type: 'text-end', id })
    }
  })
  return createUIMessageStreamResponse({ stream })
}

// Correct useChat pattern (ai v6)
const { messages, sendMessage, status } = useChat({ api: '/api/onboard', messages: [...] })
// sendMessage({ text: input }) — NOT handleSubmit
// messages[n].parts — NOT messages[n].content
```
