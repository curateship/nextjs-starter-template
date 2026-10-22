/**
 * The words of a title that carry its meaning, for "what you said before"
 * beside the reply box: Reddit's past answers (`reddit/past-answers.ts`) and
 * Medium's (`medium/responses.ts`) match titles the same way. Shared, because
 * the second network needed it (`workspace/docs/where-the-code-lives.md`).
 */

/** Words too common to say two titles are about the same thing. */
const COMMON = new Set(
  "a an and are as at be but by can do for from has have how i if in is it its me my of on or so that the this to was what when where which who why will with you your any does should would could best good".split(
    " "
  )
)

/** The words of a title that carry its meaning, lower case. */
export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !COMMON.has(word))
  )
}
