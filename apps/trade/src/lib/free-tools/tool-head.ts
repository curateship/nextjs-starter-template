import { resolveAppName } from "@/lib/branding"
import { pageForPath } from "@/lib/pages/page-registry"
import {
  publicSocialMeta,
  resolvePublicSeoMetadata,
  type PublicSeo,
  type SocialCardType,
} from "@/lib/pages/public-metadata"

/** The parts of the root route's branding a tool's head needs. */
type RootBranding = {
  appName?: string
  publicSeo?: PublicSeo
  shareImage?: string
  socialCardType?: SocialCardType
  socialHandle?: string
}

/**
 * A free tool's `<title>` and share preview, from its `*.page.ts` declaration
 * and the site's saved social settings.
 *
 * The root route does this for any page whose route id matches its
 * declaration. A tool's route is `tools_.<name>.tsx`, whose id keeps the
 * underscore, so the root cannot find the declaration and the tool says it
 * itself. The router keeps the deeper route's tags over the root's.
 *
 * `branding` is the root route's loader data, which the tool's loader passes
 * through from `parentMatchPromise`. Read from `matches` instead, it is still
 * missing when the server draws the page, and the server and the browser then
 * disagree on the title.
 */
export function freeToolHead(path: string, branding: unknown) {
  const page = pageForPath(path)
  const saved = (branding ?? {}) as RootBranding
  const appName = resolveAppName(saved.appName)
  const metadata = resolvePublicSeoMetadata({
    title: `${page?.name ?? "Free tools"} · ${appName}`,
    description: page?.summary ?? "",
    appName,
    home: false,
    seo: saved.publicSeo,
  })
  return {
    meta: [
      { title: metadata.title },
      ...publicSocialMeta({
        title: metadata.title,
        description: metadata.description,
        image: saved.shareImage ?? "",
        cardType: saved.socialCardType ?? "summary",
        handle: saved.socialHandle ?? "",
      }),
    ],
  }
}
