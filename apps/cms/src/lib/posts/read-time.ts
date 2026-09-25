import { postBodyText, type PostBody } from "@/lib/posts/post-body"

/**
 * How long a post takes to read, in whole minutes, for the "4 min read" chip
 * on a post card.
 *
 * 200 words a minute is the ordinary figure for reading on a screen, and it is
 * the one every site that prints this uses. The answer is rounded to the
 * nearest minute and never goes below one, because "0 min read" says nothing
 * and a post with three words still has to be opened.
 *
 * Counted once when a post is saved and kept in a column, so drawing a page of
 * cards never has to fetch twelve article bodies to print twelve small numbers.
 */
const WORDS_A_MINUTE = 200

export function readMinutes(body: PostBody): number {
  const words = postBodyText(body).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_A_MINUTE))
}
