import type { Metadata } from "next";
import "./globals.css";
import { DeferredScripts } from "@/components/frontend/layout/deferred-scripts";
import { getSiteFromHeaders } from "@/lib/utils/site-resolver";
import { PostHogScript } from "@/components/admin/shared/analytics/posthog-script";
import { HeaderScripts } from "@/components/admin/shared/analytics/header-scripts";
import { toCdnUrl } from "@/lib/utils/cdn";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { success, site } = await getSiteFromHeaders();

    if (success && site && site.settings?.favicon) {
      const favicon = toCdnUrl(site.settings.favicon)
      return {
        icons: {
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
      };
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

  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={fonts ? {
        ['--font-primary' as string]: fonts.fontPrimary,
        ['--font-secondary' as string]: fonts.fontSecondary,
        ['--font-sans' as string]: fonts.fontSecondary
      } : undefined}
    >
      <head>{fonts ? (<>
        {fonts.preloadPaths.map(path => (
          <link key={path} rel="preload" href={path} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        <style dangerouslySetInnerHTML={{ __html: fonts.fontCSS }} />
      </>) : null}</head>
      <body
        className="min-h-screen bg-background font-sans antialiased"
      >
        <PostHogScript
          siteId={site?.id}
          siteName={site?.name}
          posthogKey={site?.settings?.posthog_api_key}
          posthogHost={site?.settings?.posthog_host}
        />
        <HeaderScripts scripts={site?.settings?.tracking_scripts} />
        {children}
        <DeferredScripts />
      </body>
    </html>
  );
}