import type { ReactNode } from "react"
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router"

import "@/styles.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadCurrentUser } from "@/lib/api/auth"
import { ThemeProvider } from "@/pages/dashboard/sticky-header/light-dark-switcher"

export const Route = createRootRoute({
  beforeLoad: async () => ({ user: await loadCurrentUser() }),
  head: () => ({
    links: [
      { rel: "icon", type: "image/png", href: "/pomoder/thumbs-lofi_girl.png" },
    ],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pomoder — protect your focus" },
      { name: "theme-color", content: "#0b0b0e" },
      {
        name: "description",
        content:
          "A calm Pomodoro timer with tasks, focus rooms and ambient media.",
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <ThemeProvider>
        <TooltipProvider>
          <Outlet />
        </TooltipProvider>
      </ThemeProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const nonce = useRouter().options.ssr?.nonce
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){}",
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
