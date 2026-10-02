/**
 * How X's profile page leaves a post it would not serve whole.
 *
 * A long post comes back cut: the words stop mid-sentence and a `t.co` link
 * stands where the rest should be. Trade stores what it was given, so the post
 * is still cut when somebody opens it. The window says so rather than letting
 * a reader take half a post for all of it.
 *
 * Measured on the live database on 2 Oct 2026: of 47 posts held, the longest
 * eight were 300 to 304 characters and every one of them ended that way.
 *
 * Matched on the link at the very end rather than on the length alone, because
 * the cut lands anywhere around 300 characters depending on the words. The
 * length is still part of the test, because a short post ending in a link is
 * an ordinary post with a link on the end.
 */
const CUT_AT_LEAST = 240

export function postArrivedCut(text: string): boolean {
  return text.length >= CUT_AT_LEAST && /https:\/\/t\.co\/\S+$/.test(text.trim())
}
