import { jsonLdText } from "@/lib/directory/public-seo"

/**
 * The JSON-LD block a search engine reads.
 *
 * `dangerouslySetInnerHTML` is unavoidable and safe here, and the two go
 * together: React escapes text nodes, so writing the JSON as a child would
 * turn every `"` into `&quot;` and the block would not parse. So the text is
 * written raw — and `jsonLdText` has already replaced every `<` with its
 * escape, which is the only character that could end the script tag early and
 * turn a listing's title into markup.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdText(data) }}
    />
  )
}
