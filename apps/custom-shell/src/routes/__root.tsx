import type { ReactNode } from "react"
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
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
import { useDismissErrorToastOnNavigate } from "@/lib/error-toast"
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

function RootComponent() {
  useDismissErrorToastOnNavigate()
  useTrafficBeacon()

  return (
    <RootDocument>
      <ThemeProvider>
        <TooltipProvider>
          <Outlet />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){}",
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: noFlashCollapseScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
