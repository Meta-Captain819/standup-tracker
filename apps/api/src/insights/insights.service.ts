
import type { AuthContext } from "../auth/authenticate";
import { forTeam } from "../data-access";
import type { Prisma } from "../generated/prisma/client";
import { getTeamStandupsForDate } from "../standups/standups.service";
import { generateSummary, type GeminiFailureReason, type GeminiPrompt } from "./insights.gemini";
import { buildSummaryPrompt } from "./insights.prompt";
import { generatedSummarySchema } from "./insights.schemas";

const summarySelect = {
  standupDate: true,
  summary: true,
  fingerprint: true,
  generatedAt: true,
} satisfies Prisma.AiSummarySelect;

export type CachedSummary = Prisma.AiSummaryGetPayload<{ select: typeof summarySelect }>;

/** The team's cached summary for one day, or null if none has been generated yet. Tenant-scoped. */
export function readCachedSummary(
  auth: AuthContext,
  standupDate: Date,
): Promise<CachedSummary | null> {
  return forTeam(auth.teamId).aiSummary.findFirst({
    where: { standupDate },
    select: summarySelect,
  });
}

/**
 * Upsert the team's cached summary for a day, keyed on `(teamId, standupDate)` — so a regeneration
 * reconciles onto the existing row instead of duplicating. Tenant-scoped: the wrapper pins `teamId` on
 * both the lookup and the created row, so this can never write into another team's cache.
 */
export function writeCachedSummary(
  auth: AuthContext,
  standupDate: Date,
  summary: string,
  fingerprint: string,
): Promise<CachedSummary> {
  return forTeam(auth.teamId).aiSummary.upsert({
    where: { teamId_standupDate: { teamId: auth.teamId, standupDate } },
    create: { teamId: auth.teamId, standupDate, summary, fingerprint },
    update: { summary, fingerprint },
    select: summarySelect,
  });
}


type GenerationFailure = GeminiFailureReason | "invalid";

/**
 * Issue one batched Gemini call for the whole team through the Phase 2 client and validate its output
 * with Zod before it is trusted. Returns either a schema-validated summary or a clean typed failure —
 * never a partial or fabricated summary (AI module plan Phase 4). No caching or HTTP here.
 */
async function generateValidatedSummary(
  prompt: GeminiPrompt,
): Promise<{ ok: true; summary: string } | { ok: false; reason: GenerationFailure }> {
  const result = await generateSummary(prompt);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  const parsed = generatedSummarySchema.safeParse(result.text);
  if (!parsed.success) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, summary: parsed.data };
}


export type DaySummary =
  | { status: "ready"; standupDate: Date; summary: string; generatedAt: Date }
  | { status: "unavailable" };

/**
 * Serve a team's day summary from the Postgres cache, regenerating only when it is genuinely stale (the
 * source-updates fingerprint no longer matches) or a lead explicitly refreshes — so an unchanged,
 * already-cached day costs nothing extra and never calls Gemini (AI module plan Phase 5). All reads and
 * writes are tenant-scoped. On any generation failure the call degrades to "unavailable" rather than
 * throwing or blanking the board (Phase 6, CLAUDE §8).
 */
export async function getDaySummary(
  auth: AuthContext,
  standupDate: Date,
  options: { refresh: boolean },
): Promise<DaySummary> {
  const standups = await getTeamStandupsForDate(auth, standupDate);
  const { prompt, fingerprint } = buildSummaryPrompt(standupDate, standups);

  const cached = await readCachedSummary(auth, standupDate);
  if (!options.refresh && cached && cached.fingerprint === fingerprint) {
    return {
      status: "ready",
      standupDate,
      summary: cached.summary,
      generatedAt: cached.generatedAt,
    };
  }

  const generated = await generateValidatedSummary(prompt);
  if (!generated.ok) {
    console.warn(`[insights] summary unavailable team=${auth.teamId} reason=${generated.reason}`);
    return { status: "unavailable" };
  }

  // Persist the fresh summary with its fingerprint, reconciling onto the existing (teamId, standupDate)
  // row. The cache lives only in Postgres — no in-process read-model holds the summary, so there is
  // nothing further to invalidate here (architecture §10; no unsanctioned cache tier is introduced).
  const saved = await writeCachedSummary(auth, standupDate, generated.summary, fingerprint);
  return { status: "ready", standupDate, summary: saved.summary, generatedAt: saved.generatedAt };
}
