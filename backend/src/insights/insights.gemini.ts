// AI Insights — the single, safe boundary to Gemini (AI module plan Phase 2; CLAUDE §7/§8, architecture
// §11/§16). Every generation call goes through here. The wrapper is configured entirely from env
// (Flash-class tier, a capped output length, a hard time-box) and holds NO prompt logic and makes NO
// product decisions — Phase 3 assembles the grounded prompt and passes it in. It issues one time-boxed,
// capped, backoff-retried call and returns either the raw model text or a typed failure. It NEVER throws
// and NEVER hangs: a slow dependency is cut off by the time-box, so the AI can never stall a caller.
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

// The fully-assembled prompt handed in by Phase 3: a summarize-only system instruction plus the grounded
// user content built from the team's real updates. Both are opaque strings to this layer.
export interface GeminiPrompt {
  system: string;
  user: string;
}

export type GeminiFailureReason =
  | "not_configured" // no GEMINI_API_KEY in env — AI degrades, never blocks
  | "timeout" // the time-box cut off a slow/hung call
  | "empty" // the model returned no usable text
  | "error"; // transient errors exhausted, or a permanent request error

export type GeminiResult = { ok: true; text: string } | { ok: false; reason: GeminiFailureReason };

// One initial attempt plus two retries. Small constant — a distributed dependency blip clears fast, and
// the per-attempt time-box bounds the total wait regardless.
const MAX_ATTEMPTS = 3;
// Exponential backoff base between transient retries (300ms, 600ms). Kept short so retries never blow the
// caller's budget; a genuinely hung call is cut by the time-box instead.
const BACKOFF_BASE_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry only fast-failing transient errors (network blips, 408/429, 5xx). A permanent request error
// (e.g. 400/401/403) is not retried — retrying it only wastes the budget. A time-box abort is handled by
// the caller (not here) as a `timeout`, never a retry, so a slow dependency can't be re-hit.
function isTransient(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number") {
    return status === 408 || status === 429 || status >= 500;
  }
  // No HTTP status means a transport-level failure (DNS, reset, socket) — treat as transient.
  return true;
}

async function callOnce(
  ai: GoogleGenAI,
  prompt: GeminiPrompt,
  signal: AbortSignal,
): Promise<GeminiResult> {
  const response = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: prompt.user,
    config: {
      systemInstruction: prompt.system,
      maxOutputTokens: env.GEMINI_MAX_OUTPUT_TOKENS,
      // Summarization, not creative generation — keep it grounded and near-deterministic.
      temperature: 0.2,
      // Belt-and-braces time-box: the SDK's own request timeout plus a client-side abort (below).
      httpOptions: { timeout: env.GEMINI_TIMEOUT_MS },
      abortSignal: signal,
    },
  });

  const text = response.text;
  if (text === undefined || text.trim() === "") {
    return { ok: false, reason: "empty" };
  }
  return { ok: true, text };
}

/**
 * Issue one summarize call for a fully-assembled prompt. Returns the raw model text or a typed failure —
 * the AI never surfaces as a thrown, un-time-boxed hang. With no key configured it fails as
 * `not_configured` so callers degrade gracefully; a slow call is cut off as `timeout`; transient errors
 * are retried with backoff and, if exhausted, surface as `error`.
 */
export async function generateSummary(prompt: GeminiPrompt): Promise<GeminiResult> {
  if (!env.GEMINI_API_KEY) {
    return { ok: false, reason: "not_configured" };
  }

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.GEMINI_TIMEOUT_MS);
    try {
      return await callOnce(ai, prompt, controller.signal);
    } catch (err) {
      // A time-box abort is a hung dependency, cut off — surface it, never retry it.
      if (controller.signal.aborted) {
        return { ok: false, reason: "timeout" };
      }
      // Permanent error, or last attempt: give up as a clean typed failure.
      if (!isTransient(err) || attempt === MAX_ATTEMPTS - 1) {
        return { ok: false, reason: "error" };
      }
      await delay(BACKOFF_BASE_MS * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  // Unreachable: the loop always returns on its final attempt.
  return { ok: false, reason: "error" };
}
