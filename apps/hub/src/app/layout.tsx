import type { Metadata } from "next";
import "./globals.css";
import { DeferredScripts } from "@/components/frontend/layout/deferred-scripts";
import { getSiteFromHeaders } from "@/lib/utils/site-resolver";
import { HeaderScripts } from "@/components/admin/shared/analytics/header-scripts";
import { AnalyticsTracker } from "@/components/admin/shared/analytics/tracker";
import { toCdnUrl } from "@/lib/utils/cdn";
import { getSessionCookieCacheVersion } from "@/lib/auth/server";
import type { Session as BetterAuthSession, User as BetterAuthUser } from "better-auth";
import { getCookieCache } from "better-auth/cookies";
import { SiteAuthProvider, type SiteAuthUser } from "@/components/frontend/layout/site-auth-provider";
import { headers } from "next/headers";

type SiteAuthCookieCache = {
  session: BetterAuthSession & Record<string, any>
  user: BetterAuthUser & { role?: string | null; displayName?: string | null } & Record<string, any>
  updatedAt: number
  version?: string
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { success, site } = await getSiteFromHeaders();

    if (success && site) {
      const metadata: any = {}

      // Favicon
      if (site.settings?.favicon) {
        const favicon = toCdnUrl(site.settings.favicon)
        metadata.icons = {
          icon: favicon,
          apple: favicon,
          other: [
            {
              rel: 'apple-touch-icon',
              url: favicon,
              sizes: '180x180'
            }
          ]
        }
      }

      // Google site verification meta tag
      if (site.settings?.seo_google_verification) {
        metadata.verification = {
          google: site.settings.seo_google_verification,
        }
      }

      return metadata;
    }
  } catch (error) {
    // Fallback to default
  }

  return {};
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { success, site } = await getSiteFromHeaders()
  const { getFontConfig } = await import("@/lib/utils/font-config")
  let initialSessionUser: SiteAuthUser | null = null

  try {
    const cookieCache = await getCookieCache<SiteAuthCookieCache>(await headers(), {
      version: getSessionCookieCacheVersion,
    })
    initialSessionUser = cookieCache?.user
      ? {
          email: cookieCache.user.email ?? null,
          name: cookieCache.user.displayName || cookieCache.user.name || null,
          role: typeof cookieCache.user.role === 'string' ? cookieCache.user.role : null,
        }
      : null
  } catch {
    initialSessionUser = null
  }

  const fonts = success && site?.settings
    ? getFontConfig(
        site.settings.font_family || 'playfair-display',
        site.settings.secondary_font_family || 'urbanist'
      )
    : null

  // Apply theme class server-side when dark mode toggle is disabled
  const defaultTheme = site?.settings?.default_theme || 'system'
  const activeNavStyle = site?.settings?.navigation?.navigationStyle || 'default'
  const resolvedNavStyle = site?.settings?.navigation?.styleConfig?.[activeNavStyle]
  const themeToggleEnabled = resolvedNavStyle?.showDarkModeToggle !== false
  const serverThemeClass = !themeToggleEnabled && defaultTheme === 'dark' ? 'dark' : ''
  const fontConfigKey = success && site?.settings
    ? `${site.settings.font_family || 'playfair-display'}:${site.settings.secondary_font_family || 'urbanist'}`
    : 'default'

  return (
    <html
      lang="en"
      className={serverThemeClass}
      suppressHydrationWarning
      style={fonts ? {
        ['--font-primary' as string]: fonts.fontPrimary,
        ['--font-secondary' as string]: fonts.fontSecondary,
        ['--font-sans' as string]: fonts.fontSecondary
      } : undefined}
    >
      <head>
        <link
          key="r2-preconnect"
          rel="preconnect"
          href="https://pub-01334433f2d349b1814dc29bae7f95d7.r2.dev"
        />
        {fonts ? (<>
          {fonts.preloadPaths.map(path => (
            <link
              key={`font-preload:${path}`}
              rel="preload"
              href={path}
              as="font"
              type="font/woff2"
              crossOrigin="anonymous"
              data-font-preload="true"
            />
          ))}
          <style
            key={`font-css:${fontConfigKey}`}
            id="site-font-face-styles"
            data-font-css="true"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: fonts.fontCSS }}
          />
        </>) : null}
      </head>
      <body
        className="min-h-screen bg-background font-sans antialiased"
      >
        <SiteAuthProvider user={initialSessionUser}>
          <HeaderScripts scripts={site?.settings?.tracking_scripts} />
          {site?.settings?.custom_analytics_enabled && <AnalyticsTracker />}
          {children}
          <DeferredScripts />
        </SiteAuthProvider>
      </body>
    </html>
  );
}
