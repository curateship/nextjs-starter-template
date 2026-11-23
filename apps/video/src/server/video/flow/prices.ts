import { pickWriter } from "@/lib/video/ai-choices"
import { flowStepEstimateCents, type FlowEstimateFacts } from "@/lib/video/flow/estimates"
import { FLOW_KINDS, type FlowKind } from "@/lib/video/flow/node-kinds"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import { getAiDefaults } from "@/server/video/settings"

/** Which writer answers words now, for a price. */
export async function currentWriter() {
  return pickWriter(await getAiDefaults(), await getAiKeysSaved())?.id ?? null
}

/** A prompt of about this many characters, for the builder's "from about". */
const BUILDER_PROMPT_CHARACTERS = 4_000

/** "From about" each AI node costs, before anything is connected. */
export async function flowKindPrices(): Promise<Record<FlowKind, number>> {
  const facts: FlowEstimateFacts = { writer: await currentWriter(), promptCharacters: BUILDER_PROMPT_CHARACTERS }
  return Object.fromEntries(FLOW_KINDS.map((kind) => [kind, flowStepEstimateCents(kind, facts)])) as Record<FlowKind, number>
}
