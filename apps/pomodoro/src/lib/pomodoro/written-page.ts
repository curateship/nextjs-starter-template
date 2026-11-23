import { redirect } from "@tanstack/react-router"

import type { loadPublicPageBlocks } from "@/lib/api/content/page-blocks"

/**
 * What a page an admin wrote carries into Pomoder's frame
 * (`written-page-frame.tsx`): its rows, and the head the shell's catch-all
 * would have given it.
 */
export type WrittenPageData = {
  blocks: Awaited<ReturnType<typeof loadPublicPageBlocks>>
  meta: Array<Record<string, string>>
}

/**
 * Answers an address with the admin's written page, or null when there is
 * none, so the shell's catch-all says not-found exactly as before. Whether
 * this visitor may read it is decided by the shell's own `loadWrittenPage`:
 * a page switched off comes back missing, a members-only one asks for sign-in.
 *
 * The readers are imported here, when an address is asked for, because
 * `src/app/options.ts` may not reach an endpoint module while it is still
 * being read.
 */
export async function loadWrittenPageForPomoder(path: string): Promise<WrittenPageData | null> {
  const [{ loadWrittenPage }, { loadPublicPageBlocks }, { resolveAppName }, metadata] = await Promise.all([
    import("@/lib/api/content/pages"),
    import("@/lib/api/content/page-blocks"),
    import("@/lib/branding"),
    import("@/lib/pages/public-metadata"),
  ])
  const view = await loadWrittenPage(path)
  if (view.status === "missing") return null
  if (view.status === "signIn") throw redirect({ to: "/login", search: { redirect: path } })
  const seo = metadata.resolveWrittenPageSeoMetadata({
    pageTitle: view.page.title,
    appName: resolveAppName(view.branding.appName),
    seo: view.branding.publicSeo,
  })
  return {
    // Read after the page itself, because that read decides whether this
    // visitor may see the address at all.
    blocks: await loadPublicPageBlocks(path),
    meta: [
      { title: seo.title },
      ...(view.page.hiddenFromSearch ? [{ name: "robots", content: "noindex" }] : []),
      ...metadata.publicSocialMeta({
        title: seo.socialTitle,
        description: seo.description,
        image: view.branding.shareImage,
        cardType: view.branding.socialCardType,
        handle: view.branding.socialHandle,
      }),
    ].map((tag) => Object.fromEntries(Object.entries(tag).filter((entry): entry is [string, string] => typeof entry[1] === "string"))),
  }
}
