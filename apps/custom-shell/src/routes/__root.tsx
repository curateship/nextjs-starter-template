import { capitalise, workspaceWord } from "@/lib/app-options"
import type { ReactNode } from "react"
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router"

import "@/styles.css"
import { BrandLogo } from "@/components/shell/brand-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadBranding } from "@/lib/api/shell"
import { resolveAppName, usePublicTheme } from "@/lib/branding"
import { focusRing } from "@/lib/layout/focus-ring"
import {
  publicFaviconLinks,
  type PublicFaviconSet,
} from "@/lib/favicon"
import {
  publicFontHref,
  type PublicFontAsset,
} from "@/lib/public-font"
import {
  noFlashThemeScript,
  publicThemeStyle,
  type PublicTheme,
} from "@/lib/public-theme"
import { useDismissErrorToastOnNavigate } from "@/lib/toast/error-toast"
import { noFlashCollapseScript } from "@/lib/remembered-choice"
import { routePageTitle } from "@/lib/nav/route-title"
import { pageForPath } from "@/lib/pages/page-registry"
import {
  DEFAULT_HOME_DESCRIPTION,
  publicSocialMeta,
  resolvePublicSeoMetadata,
} from "@/lib/pages/public-metadata"
import {
  publicPageUrl,
  publicStructuredDataText,
  type PublicStructuredDataInput,
} from "@/lib/pages/public-structured-data"
import { useTrafficBeacon } from "@/lib/traffic-beacon"
import { cn } from "@/lib/utils"
import { ThemeProvider } from "@/components/shell/sticky-header/light-dark-switcher"

// The app name and logo change about as rarely as the shell config, so hold
// them for the same minute rather than re-reading on every navigation.
const BRANDING_STALE_TIME_MS = 60_000

function routeTitle(
  matches: ReadonlyArray<{ routeId: string; loaderData?: unknown }>,
  appName: string | null | undefined,
) {
  const match = matches.at(-1)
  const page =
    writtenPageTitle(match?.loaderData) ??
    pageForPath(match?.routeId ?? "")?.name ??
    routePageTitle(match?.routeId, capitalise(workspaceWord().many))
  return `${page} · ${resolveAppName(appName)}`
}

function writtenPageTitle(loaderData: unknown) {
  if (!loaderData || typeof loaderData !== "object") return null
  const data = loaderData as {
    source?: unknown
    page?: { title?: unknown }
  }
  return data.source === "written" && typeof data.page?.title === "string"
    ? data.page.title
    : null
}

export const Route = createRootRoute({
  staleTime: BRANDING_STALE_TIME_MS,
  loader: () => loadBranding(),
  head: ({ loaderData, matches }) => {
    const match = matches.at(-1)
    const appName = resolveAppName(loaderData?.appName)
    const home = String(match?.routeId) === "/"
    const metadata = resolvePublicSeoMetadata({
      title: routeTitle(matches, loaderData?.appName),
      description: home
        ? DEFAULT_HOME_DESCRIPTION
        : (!writtenPageTitle(match?.loaderData) &&
            pageForPath(match?.routeId ?? "")?.summary) ||
          "",
      appName,
      home,
      seo: loaderData?.publicSeo,
    })
    const publicPage = !matches.some((item) =>
      item.routeId.startsWith("/_authenticated")
    )

    return {
      meta: [
        { charSet: "utf-8" },
        // `initial-scale=1`, with an equals sign. A colon is CSS habit and
        // browsers reject the whole key, which every page announced in the
        // console and which left the starting zoom unset on phones.
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: metadata.title },
        ...(publicPage
          ? publicSocialMeta({
              title: metadata.title,
              description: metadata.description,
              image: loaderData?.shareImage ?? "",
              cardType: loaderData?.socialCardType ?? "summary",
              handle: loaderData?.socialHandle ?? "",
            })
          : []),
      ],
    }
  },
  component: RootComponent,
  errorComponent: RootErrorComponent,
})

/**
 * The last resort, for a failure that escaped every page's own error strip.
 * It uses only root branding and small shared primitives, not the public frame
 * whose own work may be where the crash began.
 */
function RootErrorComponent({ error: _error }: ErrorComponentProps) {
  const router = useRouter()
  const branding = Route.useLoaderData()
  const appName = resolveAppName(branding?.appName)
  const publicTheme = branding?.publicTheme ?? null
  const canvasStyle = publicTheme?.canvasColor
    ? { backgroundColor: publicTheme.canvasColor }
    : undefined

  return (
    <RootDocument
      publicTheme={publicTheme}
      favicon={branding?.favicon}
      faviconDark={branding?.faviconDark}
      faviconSet={branding?.faviconSet}
      publicFont={branding?.publicFont}
    >
      <ThemeProvider
        forcedTheme={
          publicTheme?.colorScheme === "light" ||
          publicTheme?.colorScheme === "dark"
            ? publicTheme.colorScheme
            : undefined
        }
      >
        <div
          data-public-canvas=""
          className="flex min-h-screen flex-col bg-muted/60"
          style={canvasStyle}
        >
          <header
            className={
              publicTheme?.headerBorder
                ? "border-b bg-background"
                : "bg-background"
            }
          >
            <div className="mx-auto flex w-full max-w-6xl items-center px-3 py-2 md:px-4">
              <a
                href="/"
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md text-sm font-medium",
                  focusRing
                )}
              >
                <BrandLogo
                  src={branding?.logo ?? ""}
                  darkSrc={branding?.logoDark ?? ""}
                  appName={appName}
                />
                <span className="truncate">{appName}</span>
              </a>
            </div>
          </header>
          <main className="grid flex-1 place-items-center px-4 py-10">
            <Card className="w-full max-w-md" size="sm">
              <CardHeader>
                <CardTitle as="h1">Something went wrong</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  The page could not be loaded. Try again or return to the front
                  page.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void router.invalidate()}
                  >
                    Try again
                  </Button>
                  <Button asChild variant="outline">
                    <a href="/">Go to the front page</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </main>
        </div>
      </ThemeProvider>
    </RootDocument>
  )
}

function RootComponent() {
  useDismissErrorToastOnNavigate()
  useTrafficBeacon()
  const signedInPage = useSignedInPage()
  const savedPublicTheme = usePublicTheme()
  const publicTheme = signedInPage ? null : savedPublicTheme

  // A domain belonging to no workspace is a dead end — a subdomain nobody has
  // taken, or one whose workspace is switched off. Serving the deployment's own
  // pages under it would read as if the site were still there, just wearing the
  // wrong clothes.
  //
  // Drawn here rather than thrown from the loader: this route's own `<head>`
  // and document are built from that same loader data, so throwing leaves them
  // with nothing and the render fails before any not-found page is reached.
  const {
    appName,
    favicon,
    faviconDark,
    faviconSet,
    publicFont,
    publicOrigin,
    hostIsUnknown,
  } = Route.useLoaderData()

  return (
    <RootDocument
      publicTheme={publicTheme}
      favicon={favicon}
      faviconDark={faviconDark}
      faviconSet={faviconSet}
      publicFont={publicFont}
      structuredData={
        hostIsUnknown
          ? null
          : {
              organization: {
                name: resolveAppName(appName),
                url: publicOrigin,
              },
              pageOrigin: publicOrigin,
            }
      }
    >
      <ThemeProvider
        forcedTheme={
          publicTheme?.colorScheme === "light" ||
          publicTheme?.colorScheme === "dark"
            ? publicTheme.colorScheme
            : undefined
        }
      >
        <TooltipProvider>
          <div data-slot="app-canvas">
            {hostIsUnknown ? <UnknownHost /> : <Outlet />}
          </div>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </RootDocument>
  )
}

function useSignedInPage() {
  return useRouterState({
    select: (state) =>
      state.matches.some((match) =>
        match.routeId.startsWith("/_authenticated")
      ),
  })
}

/** What a domain nobody has claimed says. Deliberately tells you nothing else. */
function UnknownHost() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/60 p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-2 py-8 text-center">
          <h1 className="text-lg font-semibold">This address is not in use</h1>
          <p className="text-sm text-muted-foreground">
            Nothing is set up to answer here. Check the address and try again.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

function RootDocument({
  children,
  publicTheme = null,
  favicon = "",
  faviconDark = "",
  faviconSet = null,
  publicFont = null,
  structuredData = null,
}: Readonly<{
  children: ReactNode
  publicTheme?: PublicTheme | null
  favicon?: string
  faviconDark?: string
  faviconSet?: PublicFaviconSet | null
  publicFont?: PublicFontAsset | null
  structuredData?: {
    organization: PublicStructuredDataInput["organization"]
    pageOrigin: string
  } | null
}>) {
  const signedInPage = useSignedInPage()
  const style = publicTheme ? publicThemeStyle(publicTheme) : undefined
  const customFontHref =
    publicTheme?.useCustomFont && publicFont ? publicFontHref(publicFont) : ""
  const wantsInter =
    signedInPage ||
    (publicTheme?.font === "inter" && !publicTheme.useCustomFont)
  const faviconLinks = publicFaviconLinks({
    favicon,
    faviconDark,
    faviconSet,
  })
  const structuredDataText = usePublicStructuredDataText(structuredData)

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-public-brand={publicTheme?.brandColor ? "" : undefined}
      data-public-pattern={
        publicTheme &&
        publicTheme.backgroundPattern !== "none" &&
        publicTheme.backgroundPatternOpacity > 0
          ? publicTheme.backgroundPattern
          : undefined
      }
      data-public-button-style={
        publicTheme?.buttonStyle === "outline" ? "outline" : undefined
      }
      data-public-button-casing={
        publicTheme?.buttonCasing === "uppercase" ? "uppercase" : undefined
      }
      style={style}
    >
      <head>
        {/*
         * Only the signed-in pages use Inter, so only they ask for it early.
         * Without this the font arrives after the stylesheet and the page
         * repaints once in the system font first.
         */}
        {wantsInter ? (
          <link
            rel="preload"
            href="/fonts/inter-latin.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ) : null}
        {customFontHref ? (
          <>
            <link
              rel="preload"
              href={customFontHref}
              as="font"
              type="font/woff2"
              crossOrigin="anonymous"
            />
            <style data-public-font="true">{`@font-face{font-family:"Custom public font";src:url("${customFontHref}") format("woff2");font-display:swap;font-style:normal;font-weight:400;}`}</style>
          </>
        ) : null}
        <script
          dangerouslySetInnerHTML={{
            __html: noFlashThemeScript(
              publicTheme?.colorScheme ?? "system"
            ),
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: noFlashCollapseScript }} />
        {faviconLinks.map((link) => (
          <link
            key={`${link.rel}-${link.sizes ?? "original"}-${link.media ?? "all"}`}
            {...link}
            data-custom-shell-favicon="true"
          />
        ))}
        <HeadContent />
        {structuredDataText ? (
          <script
            type="application/ld+json"
            data-public-structured-data="true"
            dangerouslySetInnerHTML={{ __html: structuredDataText }}
          />
        ) : null}
      </head>
      <body className={signedInPage ? "app-font" : undefined}>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function usePublicStructuredDataText(
  input: {
    organization: PublicStructuredDataInput["organization"]
    pageOrigin: string
  } | null
) {
  return useRouterState({
    select: (state) => {
      if (
        !input ||
        state.matches.some(
          (match) =>
            match.routeId.startsWith("/_authenticated") ||
            match.status === "notFound"
        )
      ) {
        return ""
      }

      return publicStructuredDataText({
        organization: input.organization,
        page: {
          ...resolvedPublicPageMetadata(state.matches),
          url: publicPageUrl(input.pageOrigin, state.location.pathname),
        },
      })
    },
  })
}

function resolvedPublicPageMetadata(
  matches: ReadonlyArray<{ meta?: unknown }>
): PublicStructuredDataInput["page"] {
  let name = ""
  let description = ""

  for (let matchIndex = matches.length - 1; matchIndex >= 0; matchIndex -= 1) {
    const meta = matches[matchIndex]?.meta
    if (!Array.isArray(meta)) continue

    for (let metaIndex = meta.length - 1; metaIndex >= 0; metaIndex -= 1) {
      const value = meta[metaIndex]
      if (!value || typeof value !== "object") continue
      const record = value as Record<string, unknown>
      if (!name && typeof record.title === "string") name = record.title
      if (
        !description &&
        record.name === "description" &&
        typeof record.content === "string"
      ) {
        description = record.content
      }
    }
  }

  return { name, description }
}
