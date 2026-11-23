import {
  recordAiUsage,
  recordDeferredAiSuccess,
} from "@/server/ai/usage"
import {
  GENERATION_MODELS,
  type GenerationKind,
} from "@/lib/pomodoro/generation"

/**
 * What every AI background and soundscape cost, on the shell's AI usage page
 * (Settings → AI) beside every other AI call. See
 * `workspace/docs/ai-generation.md`.
 *
 * One row per attempt that reached a provider:
 *
 * - A render the provider handed back is a success row, priced by the seconds
 *   it made. It is recorded the moment the file arrives, because that is when
 *   the provider charges, even if preparing or storing the file fails after.
 * - An attempt the provider refused or never finished is a failed row at $0.
 *
 * The member-facing limit stays Pomodoro's own monthly credits. Nothing here
 * checks the shell's dollar allowance first, so a render is never refused by
 * it. The spend still counts toward that allowance if a plan ever sets one;
 * Tyler chose that on 7 Oct 2026.
 */

/** The feature name a row is filed under on the usage page. */
export const GENERATION_FEATURE: Record<GenerationKind, string> = {
  background: "pomodoro background",
  soundscape: "pomodoro soundscape",
}

type Job = { id: string; userId: string; attempts: number }

function context(job: Job, kind: GenerationKind) {
  const { provider, model } = GENERATION_MODELS[kind]
  return {
    userId: job.userId,
    provider,
    model,
    feature: GENERATION_FEATURE[kind],
    metadata: { generationId: job.id, attempt: job.attempts },
  }
}

/** The provider made the file: one success row for the seconds it made. */
export async function recordGenerationSpend(job: Job, kind: GenerationKind) {
  await recordDeferredAiSuccess(context(job, kind), {
    inputTokens: 0,
    outputTokens: 0,
    units: GENERATION_MODELS[kind].seconds,
  })
}

/**
 * The provider did not make it: one failed row at $0.
 *
 * Only this app's own codes are kept, such as PROVIDER_TIMEOUT. Anything else
 * becomes PROVIDER_FAILED, because an unexpected error can carry the
 * provider's own words: a reply that was an HTML page instead of JSON fails to
 * parse with a piece of that page in the message.
 */
export async function recordGenerationFailure(
  job: Job,
  kind: GenerationKind,
  error: unknown
) {
  const base = context(job, kind)
  await recordAiUsage({
    ...base,
    inputTokens: 0,
    outputTokens: 0,
    status: "failed",
    metadata: { ...base.metadata, error: failureCode(error) },
  })
}

const OWN_CODE = /^(PROVIDER_[A-Z_]+|ABORTED)$/

function failureCode(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return OWN_CODE.test(message) ? message : "PROVIDER_FAILED"
}
