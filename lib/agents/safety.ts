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
