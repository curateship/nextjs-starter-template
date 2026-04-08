import type { Metadata } from "next";
import "./globals.css";
import { DeferredScripts } from "@/components/frontend/layout/deferred-scripts";
import { getSiteFromHeaders } from "@/lib/utils/site-resolver";
import { HeaderScripts } from "@/components/admin/shared/analytics/header-scripts";
import { AnalyticsTracker } from "@/components/admin/shared/analytics/tracker";
import { toCdnUrl } from "@/lib/utils/cdn";

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

  const fonts = success && site?.settings
    ? getFontConfig(
        site.settings.font_family || 'playfair-display',
        site.settings.secondary_font_family || 'urbanist'
      )
    : null

  // Apply theme class server-side when dark mode toggle is disabled
  const defaultTheme = site?.settings?.default_theme || 'system'
  const navBlock = site?.blocks?.find((b: any) => b.type === 'navigation')
  const activeNavStyle = navBlock?.content?.navigationStyle || 'default'
  const resolvedNavStyle = navBlock?.content?.styleConfig?.[activeNavStyle] || navBlock?.content?.style
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
        <HeaderScripts scripts={site?.settings?.tracking_scripts} />
        {site?.settings?.custom_analytics_enabled && <AnalyticsTracker />}
        {children}
        <DeferredScripts />
      </body>
    </html>
  );
}
