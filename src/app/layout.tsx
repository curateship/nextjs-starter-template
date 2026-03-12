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
  const { getFontFamily, getGoogleFontUrl } = await import("@/lib/utils/font-config")

  const primaryFontValue = site?.settings?.font_family || 'playfair-display'
  const secondaryFontValue = site?.settings?.secondary_font_family || 'urbanist'
  const fontPrimary = success && site?.settings ? getFontFamily(primaryFontValue) : ''
  const fontSecondary = success && site?.settings ? getFontFamily(secondaryFontValue) : ''

  const primaryFontUrl = success && site?.settings ? getGoogleFontUrl(primaryFontValue, ['400', '600', '700']) : ''
  const secondaryFontUrl = success && site?.settings && secondaryFontValue !== primaryFontValue
    ? getGoogleFontUrl(secondaryFontValue, ['400', '600', '700'])
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {primaryFontUrl && (
          <link rel="stylesheet" href={primaryFontUrl} />
        )}
        {secondaryFontUrl && (
          <link rel="stylesheet" href={secondaryFontUrl} />
        )}
      </head>
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