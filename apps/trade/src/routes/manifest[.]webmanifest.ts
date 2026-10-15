import { createFileRoute } from "@tanstack/react-router"

import { appHomeScreen } from "@/lib/app-options"
import { resolveAppName } from "@/lib/branding"
import { webAppManifest } from "@/lib/home-screen"
import { readBranding } from "@/server/shell-settings"

/**
 * The web app manifest a phone reads when the app is added to its home
 * screen (`src/lib/home-screen.ts`). It names the visited site, so a
 * multisite app's sites each get their own name and logo.
 *
 * On the local dev server a browser never reaches this route: Nitro's dev
 * middleware sends any request that isn't for a page, a manifest included,
 * to Vite's static files, which answer 404. A plain fetch or curl of the
 * address works, and the live server has no such step.
 */
export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async () => {
        const branding = await readBranding()
        const { startPath, shortName } = appHomeScreen()
        const manifest = webAppManifest({
          appName: resolveAppName(branding.appName),
          shortName,
          startPath,
          faviconSet: branding.faviconSet,
          faviconMode: branding.faviconMode,
        })
        return new Response(JSON.stringify(manifest), {
          headers: {
            "Content-Type": "application/manifest+json; charset=utf-8",
            // A logo or name change shows on the next fetch within the hour.
            "Cache-Control": "public, max-age=3600",
          },
        })
      },
    },
  },
})
