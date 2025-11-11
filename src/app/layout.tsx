import type { Metadata } from "next";
import { Urbanist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "sonner";
import { getSiteFromHeaders } from "@/lib/utils/site-resolver";

import { cn } from "@/lib/utils/tailwind-class-merger";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  const { getFontFamily } = await import("@/lib/utils/font-config")

  const fontPrimary = success && site?.settings ? getFontFamily(site.settings.font_family || 'playfair-display') : ''
  const fontSecondary = success && site?.settings ? getFontFamily(site.settings.secondary_font_family || 'urbanist') : ''

  const { FontLoader } = await import("@/components/frontend/layout/font-loader")

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
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          urbanist.variable,
          geistMono.variable
        )}
      >
        <FontLoader />
        {children}
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}