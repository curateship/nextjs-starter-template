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
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getPageErrorMessage } from "@/components/shell/route-error"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadBranding } from "@/lib/api/shell"
import { resolveAppName, usePublicTheme } from "@/lib/branding"
import { publicThemeStyle, type PublicTheme } from "@/lib/public-theme"
import { useDismissErrorToastOnNavigate } from "@/lib/toast/error-toast"
import { noFlashCollapseScript } from "@/lib/remembered-choice"
import { routePageTitle } from "@/lib/nav/route-title"
import { useTrafficBeacon } from "@/lib/traffic-beacon"
import { ThemeProvider } from "@/components/shell/sticky-header/light-dark-switcher"

// The app name and logo change about as rarely as the shell config, so hold
// them for the same minute rather than re-reading on every navigation.
const BRANDING_STALE_TIME_MS = 60_000

const PUBLIC_ROUTE_DESCRIPTIONS: Record<string, string> = {
  "/": "Accounts, workspaces and billing, ready to run.",
  "/pricing": "Plans and billing for your workspace.",
  "/login": "Sign in to your workspace.",
  "/register": "Create an account and start using your workspace.",
  "/forgot-password": "Request a link to reset your password.",
  "/reset-password": "Choose a new password for your account.",
  "/sign-in-link": "Use an email link to sign in securely.",
  "/verify-email": "Confirm your email address.",
  "/report-unwanted-sign-in":
    "Stop and report an unwanted password-reset or sign-in link.",
}

function routeTitle(
  matches: ReadonlyArray<{ routeId: string }>,
  appName: string | null | undefined,
) {
  const routeId = matches.at(-1)?.routeId
  const page = routePageTitle(routeId, capitalise(workspaceWord().many))
  return `${page} · ${resolveAppName(appName)}`
}

export const Route = createRootRoute({
  staleTime: BRANDING_STALE_TIME_MS,
  loader: () => loadBranding(),
  head: ({ loaderData, matches }) => {
    const title = routeTitle(matches, loaderData?.appName)
    const description = PUBLIC_ROUTE_DESCRIPTIONS[matches.at(-1)?.routeId ?? ""]

    return {
      meta: [
        { charSet: "utf-8" },
        // `initial-scale=1`, with an equals sign. A colon is CSS habit and
        // browsers reject the whole key, which every page announced in the
        // console and which left the starting zoom unset on phones.
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        ...(description
          ? [
              { name: "description", content: description },
              { property: "og:title", content: title },
              { property: "og:description", content: description },
              { name: "twitter:card", content: "summary" },
            ]
          : []),
      ],
    }
  },
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
  const { hostIsUnknown } = Route.useLoaderData()

  return (
    <RootDocument publicTheme={publicTheme}>
      <ThemeProvider>
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
}: Readonly<{ children: ReactNode; publicTheme?: PublicTheme | null }>) {
  const signedInPage = useSignedInPage()
  const style = publicTheme ? publicThemeStyle(publicTheme) : undefined
  const wantsInter = signedInPage || publicTheme?.font === "inter"

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-public-brand={publicTheme?.brandColor ? "" : undefined}
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
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){}",
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: noFlashCollapseScript }} />
        <HeadContent />
      </head>
      <body className={signedInPage ? "app-font" : undefined}>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
