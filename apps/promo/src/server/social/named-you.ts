import { type CustomShellDb } from "@/server/db"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { NETWORK_NAMES } from "@/lib/social/networks"
import { commentingHref, type CommentingParams } from "@/lib/social/project-address"
import { plural } from "@/lib/format/plural"

import { ringBell } from "./notices"

/**
 * The bell for a keyword marked Names you (part 5 of
 * `workspace/tasks/New features/new-features-18-nov.md`): a search that finds
 * new posts under it rings one notice, opening that keyword's posts on the
 * project's Commenting.
 *
 * - One notice per keyword. A later search with new posts brings the same
 *   notice back to the top as unread, with the newest count.
 * - A keyword's first search rings nothing, so adding one never rings for
 *   every post that was already there, as X's watched accounts do.
 * - Names a rival never rings (Tyler declined a competitor watch on
 *   12 Oct 2026). Only the product's own name does.
 */
export async function ringNamedYou(
  userId: string,
  input: {
    network: CommentingParams["network"]
    projectId: string
    keywordId: string
    /** The words, as the keyword shows them. */
    words: string
    /** New posts this search found. */
    added: number
    /** The keyword had searched before this run. */
    searchedBefore: boolean
  },
  db: CustomShellDb,
  now: Date = new Date()
): Promise<void> {
  if (!input.added || !input.searchedBefore) return
  await ringBell(
    userId,
    {
      kind: "named_you",
      targetId: input.keywordId,
      message: `${NOTICE_HEADINGS.named_you} ${input.added} new ${plural(input.added, "post", "posts")} on ${NETWORK_NAMES[input.network]} ${input.added === 1 ? "says" : "say"} "${input.words}"`,
      detail: "A keyword marked Names you found them. Open them to answer while the talk is fresh.",
      href: commentingHref(input.projectId, { network: input.network, keyword: input.keywordId }),
    },
    db,
    now
  )
}
