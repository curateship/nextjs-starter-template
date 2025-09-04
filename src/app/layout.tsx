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
          icon: site.settings.favicon
        }
      };
    }
  } catch (error) {
    // Fallback to default
  }
  
  return {};
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          urbanist.variable,
          geistMono.variable
        )}
      >
        {children}
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}