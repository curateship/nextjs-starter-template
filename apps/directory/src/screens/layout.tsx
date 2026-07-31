import type { Metadata } from "@/lib/metadata";
import { DeferredScripts } from "@/components/frontend/layout/deferred-scripts";
import { getSiteFromHeaders } from "@/lib/utils/site-resolver";
import { HeaderScripts } from "@/components/admin/layout/dashboard/analytics/header-scripts";
import { AnalyticsTracker } from "@/components/admin/layout/dashboard/analytics/tracker";
import { toCdnUrl } from "@/lib/utils/cdn";
import { SiteAuthProvider } from "@/components/frontend/layout/site-auth-provider";
import { headers } from "@/lib/request-headers";
import { isHubPlatformHost } from "@/lib/utils/platform-host";
import { getPublicCampaignsForSite } from "@/lib/actions/campaigns/campaign-actions";
import { CampaignGate } from "@/components/frontend/campaigns/CampaignGate";
import { getCachedAdminSettings } from "@/lib/actions/admin-settings/admin-settings-actions";
import { getSiteCardStyleVars } from "@/lib/utils/admin-styling";
import { clampToastSeconds } from "@/lib/toast-seconds";

export async function generateMetadata(): Promise<Metadata> {
  const defaultMetadata: Metadata = { icons: { icon: "/globe.svg" } }

  try {
    const requestHeaders = await headers()
    if (isHubPlatformHost(requestHeaders.get("host"))) {
      return defaultMetadata
    }

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

      return Object.keys(metadata).length ? metadata : defaultMetadata;
    }
  } catch (error) {
    // Fallback to default
  }

  return defaultMetadata;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers()
  const isHubRequest = isHubPlatformHost(requestHeaders.get("host"))
  const { success, site } = isHubRequest
    ? { success: false, site: null }
    : await getSiteFromHeaders()
  const { getFontConfig } = await import("@/lib/utils/font-config")

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
  const campaigns = success && site?.id ? await getPublicCampaignsForSite(site.id) : []

  // Public content cards read their border from Settings → Styling when it has
  // been saved; otherwise styles.css applies the default hairline.
  const adminSettings = await getCachedAdminSettings()
  const siteCardStyleVars = getSiteCardStyleVars(adminSettings?.settings?.styling)
  // One saved number drives every non-error toast, on admin and public pages
  // alike. Unset falls back to the default inside the store.
  const toastSeconds = clampToastSeconds(adminSettings?.settings?.toast_seconds)
  const rootStyle = fonts || siteCardStyleVars
    ? {
        ...(fonts ? {
          ['--font-primary' as string]: fonts.fontPrimary,
          ['--font-secondary' as string]: fonts.fontSecondary,
          ['--font-sans' as string]: fonts.fontSecondary
        } : {}),
        ...siteCardStyleVars
      }
    : undefined

  return (
    <div
      className={serverThemeClass}
      style={rootStyle}
    >
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
        <SiteAuthProvider>
          <HeaderScripts scripts={site?.settings?.tracking_scripts} />
          {site?.settings?.custom_analytics_enabled && <AnalyticsTracker />}
          {campaigns.length > 0 && <CampaignGate campaigns={campaigns} />}
          {children}
          <DeferredScripts toastSeconds={toastSeconds} />
        </SiteAuthProvider>
    </div>
  );
}
