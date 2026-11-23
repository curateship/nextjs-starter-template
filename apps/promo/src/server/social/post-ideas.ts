import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { askModel, pickProvider } from "./drafts"
import { projectDescription } from "./projects"

/**
 * Ideas for posts of your own from the questions people asked in a project's
 * finds, the same on every network that has them: LinkedIn's Post ideas
 * (part 35 of `workspace/tasks/LinkedIn/01-linkedin-features.md`), then
 * Reddit's and X's (part 3 of
 * `workspace/tasks/New features/new-features-18-nov.md`). Each idea names
 * the find it came from, so the person can open it.
 */

export type PostIdea = { question: string; findId: string; about: string }

/** One find as the AI is shown it: its words and the replies under it. */
type IdeaPiece = { findId: string; text: string }

/** How much of one find the AI reads. */
const PIECE_CHARS = 1_200
/** The most ideas one press asks for. */
const IDEAS = 6

export async function askPostIdeas(input: {
  userId: string
  projectId: string
  /** "LinkedIn", "Reddit" or "X", as the prompt names the network. */
  network: string
  /** "posts and their comments" or "posts and their replies". */
  pieceWords: string
  /** The line it is counted under on the AI usage screen. */
  feature: string
  pieces: IdeaPiece[]
}, db: CustomShellDb = defaultDb): Promise<PostIdea[]> {
  const { userId, projectId, network, pieces } = input
  const product = await projectDescription(userId, projectId, db)
  const numbered = pieces.map((piece, index) => `[${index + 1}]\n${piece.text.slice(0, PIECE_CHARS)}`)
  const picked = await pickProvider()
  const prompt = [
    `These are ${network} ${input.pieceWords}. Find the questions people really ask in them that would make a good ${network} post of its own.`,
    product.trim() ? `The writer makes:\n${product.trim()}` : "",
    numbered.join("\n\n"),
    `Answer with up to ${IDEAS} lines, each IDEA: then the number in brackets of the piece it came from, then the question, then | and a line on what the post would say. For example: IDEA: [3] How do you price a first SaaS? | Three pricing mistakes and what to do instead. Nothing else.`,
  ]
    .filter(Boolean)
    .join("\n\n")
  return askModel({ userId, ...picked, feature: input.feature, projectId, metadata: {}, prompt }, (answer) => {
    const ideas: PostIdea[] = []
    for (const line of answer.split("\n")) {
      const found = line.trim().match(/^IDEA:\s*\[(\d+)\]\s*(.+?)\s*\|\s*(.+)$/i)
      const piece = found ? pieces[Number(found[1]) - 1] : undefined
      if (!found || !piece) continue
      ideas.push({ question: (found[2] ?? "").slice(0, 300), findId: piece.findId, about: (found[3] ?? "").slice(0, 300) })
    }
    if (!ideas.length) throw new Error(`${picked.provider} answered, but with no ideas tied to a post.`)
    return ideas
  })
}
