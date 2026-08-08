import type { PublicSite } from "@/lib/api/sites/sites"
import { siteTitle } from "@/lib/sites/site-settings"

/**
 * A site's front page, before it has one.
 *
 * Task 02 gets a visitor to the right site and proves it by drawing that site's
 * own name and colour; task 03 replaces this with the page the admin wrote and
 * the frame it sits in. So this stays deliberately small — there is no point
 * building a layout that is about to be thrown away.
 *
 * **The shell's `PublicPageFrame` is not used here and never will be**: it draws
 * the deployment's branding — its app name, its logo — which is exactly what a
 * visitor on a site's own domain must not see.
 */
export function SiteLandingPage({ site }: { site: NonNullable<PublicSite> }) {
  const { settings } = site
  const title = siteTitle(site.name, settings)

  if (settings.maintenance) {
    return (
      <SiteShell accent={settings.themeColor}>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          This site is closed for a moment. Please check back shortly.
        </p>
      </SiteShell>
    )
  }

  return (
    <SiteShell accent={settings.themeColor}>
      {settings.logo ? (
        <img
          src={settings.logo}
          alt={title}
          className="max-h-16 w-auto max-w-full object-contain"
        />
      ) : null}

      <h1 className="text-2xl font-semibold" style={{ color: settings.themeColor }}>
        {title}
      </h1>

      {settings.tagline ? (
        <p className="text-sm text-muted-foreground">{settings.tagline}</p>
      ) : null}

      {settings.navigation.length ? (
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {settings.navigation.map((link) => (
            <a
              key={`${link.label}-${link.href}`}
              href={link.href}
              className="text-sm underline-offset-4 hover:underline"
            >
              {link.label}
            </a>
          ))}
        </nav>
      ) : null}

      <p className="text-sm text-muted-foreground">
        This site has no home page yet. One can be written for it from the admin
        area.
      </p>

      {settings.footerText ? (
        <p className="text-xs text-muted-foreground">{settings.footerText}</p>
      ) : null}
    </SiteShell>
  )
}

function SiteShell({
  accent,
  children,
}: {
  accent: string
  children: React.ReactNode
}) {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/60 p-6 text-center"
      style={{ borderTop: `4px solid ${accent}` }}
    >
      {children}
    </main>
  )
}
