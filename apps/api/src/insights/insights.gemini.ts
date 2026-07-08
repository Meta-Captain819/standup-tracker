
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

export interface GeminiPrompt {
  system: string;
  user: string;
}

export type GeminiFailureReason =
  | "not_configured" 
  | "timeout" 
  | "empty" 
  | "error"; 

export type GeminiResult = { ok: true; text: string } | { ok: false; reason: GeminiFailureReason };

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number") {
    return status === 408 || status === 429 || status >= 500;
  }
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
      temperature: 0.2,
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
      if (controller.signal.aborted) {
        return { ok: false, reason: "timeout" };
      }
      if (!isTransient(err) || attempt === MAX_ATTEMPTS - 1) {
        return { ok: false, reason: "error" };
      }
      await delay(BACKOFF_BASE_MS * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, reason: "error" };
}
