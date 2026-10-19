import { z } from "zod"

/**
 * Ask Date (part 21): a question about the member's matches, answered from
 * what each one told them. The AI sees names and facts, never whole chats.
 */

export const askMatchesAnswer = z.object({
  answers: z.array(z.object({ match: z.number().int().min(1), why: z.string().max(300) })).max(20),
})

export const askMatchesJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      description: "Every match that answers the question, best first. Empty when none does.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["match", "why"],
        properties: {
          match: { type: "integer", description: "The match's number in the list." },
          why: { type: "string", description: "One short line from their facts that answers it." },
        },
      },
    },
  },
}

export const ASK_MATCHES_SYSTEM = [
  "A member of a dating app asks a question about the people they matched with. Each match below has a number and the facts they told the member.",
  "- Answer with every match whose facts answer the question, and one short line saying why.",
  "- Use only the facts listed. A match with no fact that answers it is left out.",
].join("\n")

export function askMatchesText(question: string, matches: Array<{ name: string; facts: string[] }>): string {
  return [
    `Question: ${question}`,
    "",
    ...matches.map((match, index) => `${index + 1}. ${match.name}: ${match.facts.length ? match.facts.join("; ") : "(nothing yet)"}`),
  ].join("\n")
}
