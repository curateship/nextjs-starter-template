import { readSearchText } from "@/lib/nav/list-search"

/**
 * Whether a stored post matches what was typed in the search box over the
 * posts list.
 *
 * Title, subreddit and author only. The post's body is long enough to match
 * almost any word, and the replies are other people's words, so neither is
 * searched.
 *
 * Every word typed has to appear somewhere in those three, in any order, so
 * "saas pricing" finds a post titled "How we set our pricing" in r/SaaS. A
 * leading "r/" or "u/" is dropped from a typed word, because that is how
 * people write a subreddit or a name and the stored values have neither.
 *
 * The box's text goes through the shell's own `readSearchText` first, so
 * blank means no search and the length is capped the way every other
 * dashboard's search is.
 */
export function matchesFindSearch(
  find: { title: string; subreddit: string; author: string },
  typed: string
): boolean {
  const words = findSearchWords(typed)
  if (!words.length) return true
  const haystack = `${find.title}\n${find.subreddit}\n${find.author}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/** The words a search is made of, or none when the box is blank. */
export function findSearchWords(typed: string): string[] {
  const text = readSearchText(typed)
  if (!text) return []
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^\/?[ru]\//, ""))
    .filter(Boolean)
}
