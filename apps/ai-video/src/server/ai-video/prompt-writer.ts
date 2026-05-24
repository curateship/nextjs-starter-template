import type { UGCWorkflowInput } from "@/server/ai-video/workflows"

export type UGCPromptDraft = {
  hook: string
  script: string
  prompt: string
}

type PromptWriterInput = Omit<
  UGCWorkflowInput,
  "hook" | "script" | "prompt" | "consentConfirmed"
> & {
  hook?: string
}

export async function writeUgcPromptDraft(input: PromptWriterInput) {
  const apiKey = process.env.AI_VIDEO_TEXT_API_KEY
  const model = process.env.AI_VIDEO_TEXT_MODEL
  if (!apiKey || !model) {
    throw new Error("AI_VIDEO_TEXT_API_KEY and AI_VIDEO_TEXT_MODEL are required.")
  }

  const response = await fetch(
    process.env.AI_VIDEO_TEXT_BASE_URL || "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You write concise UGC ad scripts and provider-ready AI video prompts. Return only JSON with hook, script, and prompt fields.",
          },
          {
            role: "user",
            content: JSON.stringify({
              productName: input.productName,
              audience: input.audience,
              offer: input.offer,
              productNotes: input.productNotes,
              actorNotes: input.actorNotes,
              hook: input.hook,
              voiceTone: input.voiceTone,
              hasActorReference: Boolean(input.actorImageUrl),
              hasProductReference: Boolean(input.productMediaUrl),
            }),
          },
        ],
        temperature: 0.7,
      }),
    }
  )

  if (!response.ok) {
    throw new Error("Prompt writer request failed.")
  }

  const body = await response.json()
  return parsePromptDraft(extractResponseText(body))
}

export function parsePromptDraft(text: string): UGCPromptDraft {
  const parsed = parseJsonObject(text)
  if (parsed) {
    return {
      hook: cleanDraftText(parsed.hook),
      script: cleanDraftText(parsed.script),
      prompt: cleanDraftText(parsed.prompt),
    }
  }

  const cleaned = cleanDraftText(text)
  return {
    hook: "",
    script: cleaned,
    prompt: cleaned,
  }
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text) as Partial<UGCPromptDraft>
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as Partial<UGCPromptDraft>
    } catch {
      return null
    }
  }
}

function extractResponseText(body: unknown) {
  if (body && typeof body === "object" && "output_text" in body) {
    const value = (body as { output_text?: unknown }).output_text
    if (typeof value === "string") return value
  }

  const output = (body as { output?: unknown[] })?.output
  const content = output?.flatMap((item) =>
    Array.isArray((item as { content?: unknown[] }).content)
      ? ((item as { content: unknown[] }).content)
      : []
  )
  const text = content
    ?.map((item) => {
      const value = item as { text?: unknown; type?: unknown }
      return typeof value.text === "string" ? value.text : ""
    })
    .join("\n")
    .trim()

  if (text) return text
  throw new Error("Prompt writer returned an empty response.")
}

function cleanDraftText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 6000) : ""
}
