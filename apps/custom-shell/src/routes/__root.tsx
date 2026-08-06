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
import { resolveAppName } from "@/lib/branding"
import { useDismissErrorToastOnNavigate } from "@/lib/toast/error-toast"
import { noFlashCollapseScript } from "@/lib/remembered-choice"
import { useTrafficBeacon } from "@/lib/traffic-beacon"
import { ThemeProvider } from "@/components/shell/sticky-header/light-dark-switcher"

// The app name and logo change about as rarely as the shell config, so hold
// them for the same minute rather than re-reading on every navigation.
const BRANDING_STALE_TIME_MS = 60_000

const ROUTE_TITLES: Record<string, string> = {
  "/": "Home",
  "/login": "Sign in",
  "/register": "Create account",
  "/forgot-password": "Forgot password",
  "/reset-password": "Reset password",
  "/sign-in-link": "Sign-in link",
  "/verify-email": "Verify email",
  "/change-email": "Confirm email change",
  "/revoke-email-change": "Revoke email change",
  "/pricing": "Pricing",
  "/maintenance": "Maintenance",
  "/_authenticated/home": "Home",
  "/_authenticated/workspaces": "Workspaces",
  "/_authenticated/account": "Account",
  "/_authenticated/account/billing_/success": "Billing success",
  "/_authenticated/admin/": "Admin dashboard",
  "/_authenticated/admin/dashboard": "Admin dashboard",
  "/_authenticated/admin/users": "Users",
  "/_authenticated/admin/announcements": "Announcements",
  "/_authenticated/admin/ai": "AI",
  "/_authenticated/admin/automations": "Automations",
  "/_authenticated/admin/automations/$automationId": "Automation",
  "/_authenticated/admin/billing": "Billing",
  "/_authenticated/admin/contacts": "Contacts",
  "/_authenticated/admin/feedback": "Feedback",
  "/_authenticated/admin/media": "Media",
  "/_authenticated/admin/membership": "Membership",
  "/_authenticated/admin/newsletter": "Newsletters",
  "/_authenticated/admin/newsletter/$broadcastId": "Newsletter",
  "/_authenticated/admin/notifications": "Notifications",
  "/_authenticated/admin/plans": "Plans",
  "/_authenticated/admin/settings": "Settings",
  "/_authenticated/admin/settings/$tab": "Settings",
  "/_authenticated/admin/system-emails": "System emails",
  "/_authenticated/admin/system-emails/$kind": "System email",
  "/_authenticated/admin/traffic": "Traffic",
  "/_authenticated/changelog": "Changelog",
  "/_authenticated/changelog/": "Changelog admin",
  "/_authenticated/changelog/whats-new": "What's new",
}

const PUBLIC_ROUTE_DESCRIPTIONS: Record<string, string> = {
  "/": "Accounts, workspaces and billing, ready to run.",
  "/pricing": "Plans and billing for your workspace.",
  "/login": "Sign in to your workspace.",
  "/register": "Create an account and start using your workspace.",
  "/forgot-password": "Request a link to reset your password.",
  "/reset-password": "Choose a new password for your account.",
  "/sign-in-link": "Use an email link to sign in securely.",
  "/verify-email": "Confirm your email address.",
}

function routeTitle(
  matches: ReadonlyArray<{ routeId: string }>,
  appName: string | null | undefined
) {
  const routeId = matches.at(-1)?.routeId
  const page = (routeId && ROUTE_TITLES[routeId]) || "Page"
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
        { name: "viewport", content: "width=device-width, initial-scale: 1" },
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

  return (
    <RootDocument>
      <ThemeProvider>
        <TooltipProvider>
          <div data-slot="app-canvas">
            <Outlet />
          </div>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const signedInPage = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId.startsWith("/_authenticated")),
  })

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
         * Only the signed-in pages use Inter, so only they ask for it early.
         * Without this the font arrives after the stylesheet and the page
         * repaints once in the system font first.
         */}
        {signedInPage ? (
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
