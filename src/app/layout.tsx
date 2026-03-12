import type { Metadata } from "next";
import "./globals.css";
import { DeferredScripts } from "@/components/frontend/layout/deferred-scripts";
import { getSiteFromHeaders } from "@/lib/utils/site-resolver";
import { PostHogScript } from "@/components/admin/shared/analytics/posthog-script";
import { HeaderScripts } from "@/components/admin/shared/analytics/header-scripts";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { success, site } = await getSiteFromHeaders();

    if (success && site && site.settings?.favicon) {
      return {
        icons: {
          icon: site.settings.favicon,
          apple: site.settings.favicon,
          other: [
            {
              rel: 'apple-touch-icon',
              url: site.settings.favicon,
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
  const { getFontFamily, getFontFaceCSS } = await import("@/lib/utils/font-config")

  const primaryFontValue = site?.settings?.font_family || 'playfair-display'
  const secondaryFontValue = site?.settings?.secondary_font_family || 'urbanist'
  const fontPrimary = success && site?.settings ? getFontFamily(primaryFontValue) : ''
  const fontSecondary = success && site?.settings ? getFontFamily(secondaryFontValue) : ''

  // Only load the weights actually used on the frontend
  const FRONTEND_WEIGHTS = ['400', '500', '600', '700']

  // Generate @font-face CSS pointing to self-hosted woff2 files — no external requests
  const fontCSS = success && site?.settings
    ? [
        getFontFaceCSS(primaryFontValue, FRONTEND_WEIGHTS),
        primaryFontValue !== secondaryFontValue ? getFontFaceCSS(secondaryFontValue, FRONTEND_WEIGHTS) : '',
      ].filter(Boolean).join('\n')
    : ''

  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={fontPrimary ? {
        ['--font-primary' as string]: fontPrimary,
        ['--font-secondary' as string]: fontSecondary,
        ['--font-sans' as string]: fontSecondary
      } : undefined}
    >
      <head>{fontCSS ? (<>
        <link rel="preload" href={`/fonts/${primaryFontValue}-latin-400.woff2`} as="font" type="font/woff2" crossOrigin="anonymous" />
        {primaryFontValue !== secondaryFontValue && <link rel="preload" href={`/fonts/${secondaryFontValue}-latin-400.woff2`} as="font" type="font/woff2" crossOrigin="anonymous" />}
        <style dangerouslySetInnerHTML={{ __html: fontCSS }} />
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