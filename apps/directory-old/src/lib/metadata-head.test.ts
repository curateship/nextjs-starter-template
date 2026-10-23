import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { metadataToHead } from "./metadata-head"

describe("metadataToHead", () => {
  it("maps common Next metadata fields to TanStack head descriptors", () => {
    const head = metadataToHead({
      title: "Directory",
      description: "Browse the directory",
      openGraph: {
        title: "Directory",
        images: [{ url: "https://example.com/social.png" }],
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: "https://example.com/directory" },
    })

    assert.deepEqual(head.meta, [
      { title: "Directory" },
      { name: "description", content: "Browse the directory" },
      { property: "og:title", content: "Directory" },
      { property: "og:image", content: "https://example.com/social.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ])
    assert.deepEqual(head.links, [
      { rel: "canonical", href: "https://example.com/directory" },
    ])
  })
})
