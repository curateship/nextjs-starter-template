/**
 * The words X puts in its profile page, back as the words somebody wrote.
 *
 * The text arrives escaped twice over: once as a JavaScript string literal,
 * because the page carries its data as code, and once as HTML, because X
 * escapes what it renders. Undoing only the first left `&amp;` and `&gt;`
 * sitting in the middle of posts, which is what Tyler saw on 2 Oct 2026 when
 * he opened a post to read it without going to X.
 *
 * Its own module so it can be driven directly. `x-profile.ts` is a pile of
 * regexes over a 250KB page; this is a pure function over a string.
 */

/** `\n` and `\"` inside the page's own string literals. */
export function unescapeXText(value: string): string {
  return unescapeHtml(
    value
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
        String.fromCharCode(parseInt(code, 16))
      )
      .replace(/\\\\/g, "\\")
  )
}

/**
 * The HTML entities X leaves in the words of a post.
 *
 * X escapes the text it puts in the page, so "A &amp; B" and "slow -&gt; fast"
 * arrive with the entity still written out, and were stored and drawn that
 * way. Two of the 49 posts held on 2 Oct 2026 read wrong because of it, which
 * is what sent Tyler to X to read a post Trade already had.
 *
 * **These five by name, plus the numeric ones.** The text is never inserted as
 * HTML, so there is nothing to be careful about here beyond getting the
 * characters right, and a general-purpose decoder would be a dependency for
 * five replacements.
 *
 * `&amp;` is undone last, and separately. Doing it first would turn a literal
 * `&amp;lt;`, which is somebody writing about an entity, into a `<`.
 */
const NAMED_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
}

function unescapeHtml(value: string): string {
  let text = value
  for (const [entity, character] of Object.entries(NAMED_ENTITIES)) {
    text = text.split(entity).join(character)
  }
  text = text.replace(/&#(\d{1,7});/g, (whole, code: string) => {
    const point = Number(code)
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole
  })
  return text.split("&amp;").join("&")
}
