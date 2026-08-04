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
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getPageErrorMessage } from "@/components/shell/route-error"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadBranding } from "@/lib/api/shell"
import { resolveAppName, usePublicTheme } from "@/lib/branding"
import { useDismissErrorToastOnNavigate } from "@/lib/error-toast"
import {
  noFlashThemeScript,
  publicThemeStyle,
  type PublicTheme,
} from "@/lib/public-theme"
import { noFlashCollapseScript } from "@/lib/remembered-choice"
import { useTrafficBeacon } from "@/lib/traffic-beacon"
import { ThemeProvider } from "@/pages/dashboard/sticky-header/light-dark-switcher"

// The app name and logo change about as rarely as the shell config, so hold
// them for the same minute rather than re-reading on every navigation.
const BRANDING_STALE_TIME_MS = 60_000

export const Route = createRootRoute({
  staleTime: BRANDING_STALE_TIME_MS,
  loader: () => loadBranding(),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: resolveAppName(loaderData?.appName) },
    ],
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
})

/**
 * The last resort, for a failure that escaped every page's own error strip.
 * There is no shell around this one — the shell itself may be what failed — so
 * it stands on its own and offers the two ways out: try again, or go home.
 */
function RootErrorComponent({ error }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <RootDocument>
      <div className="grid min-h-screen place-items-center bg-muted/60 p-6">
        <div className="w-full max-w-md">
          <Card size="sm">
            <CardContent className="grid gap-4">
              <div className="grid gap-1">
                <p className="text-sm font-medium">Something went wrong</p>
                <p className="text-sm text-muted-foreground">
                  {getPageErrorMessage(error)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void router.invalidate()}>
                  Try again
                </Button>
                <Button asChild variant="outline">
                  <a href="/">Go home</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </RootDocument>
  )
}

/**
 * Whether the page on screen is behind the sign-in wall. Everything else — the
 * front page, pricing, the sign-in family, maintenance — is public, and public
 * is what the saved public theme dresses.
 */
function useSignedInPage() {
  return useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId.startsWith("/_authenticated")),
  })
}

function RootComponent() {
  useDismissErrorToastOnNavigate()
  useTrafficBeacon()
  const signedInPage = useSignedInPage()
  const savedTheme = usePublicTheme()
  // The signed-in app is not themed by this at all: it keeps the standard
  // palette and its own per-workspace styling.
  const publicTheme = signedInPage ? null : savedTheme

  return (
    <RootDocument publicTheme={publicTheme}>
      {/*
       * A public theme that names light or dark pins it for that side of the
       * app; "system" (the default) leaves the visitor in charge, exactly as
       * before. Nothing is pinned inside `_authenticated` — the signed-in app
       * keeps its own switcher and the saved choice.
       */}
      <ThemeProvider
        forcedTheme={
          publicTheme && publicTheme.colorScheme !== "system"
            ? publicTheme.colorScheme
            : undefined
        }
      >
        <TooltipProvider>
          <Outlet />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </RootDocument>
  )
}

function RootDocument({
  children,
  publicTheme = null,
}: Readonly<{ children: ReactNode; publicTheme?: PublicTheme | null }>) {
  const signedInPage = useSignedInPage()
  // Inter is bundled, so it is only ever fetched by a page that asks for it:
  // the signed-in app always does, and a public page only when the theme picks
  // it. Without the preload the page repaints once in the system font first.
  const wantsInter = signedInPage || publicTheme?.font === "inter"

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {wantsInter ? (
          <link
            rel="preload"
            href="/fonts/inter-latin.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ) : null}
        <script
          dangerouslySetInnerHTML={{
            __html: noFlashThemeScript(publicTheme?.colorScheme ?? "system"),
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: noFlashCollapseScript }} />
        <HeadContent />
      </head>
      {/*
       * The public theme goes on <body> rather than on any one page's wrapper,
       * so it reaches every public page — including the ones drawn outside the
       * shared frame — and the toasts, which portal out here. The signed-in app
       * gets no style at all, only its Inter class.
       */}
      <body
        className={signedInPage ? "app-font" : undefined}
        style={publicTheme ? publicThemeStyle(publicTheme) : undefined}
      >
        {children}
        <Scripts />
      </body>
    </html>
  )
}
