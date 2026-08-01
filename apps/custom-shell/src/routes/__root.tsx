import type { ReactNode } from "react"
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"

import "@/styles.css"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadAppName } from "@/lib/api/shell"
import { resolveAppName } from "@/lib/app-name"
import { useDismissErrorToastOnNavigate } from "@/lib/error-toast"
import { noFlashCollapseScript } from "@/lib/remembered-choice"
import { ThemeProvider } from "@/pages/dashboard/sticky-header/light-dark-switcher"

// The app name changes about as rarely as the shell config, so hold it for the
// same minute rather than re-reading it on every navigation.
const APP_NAME_STALE_TIME_MS = 60_000

export const Route = createRootRoute({
  staleTime: APP_NAME_STALE_TIME_MS,
  loader: () => loadAppName(),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: resolveAppName(loaderData?.appName) },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  useDismissErrorToastOnNavigate()

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
