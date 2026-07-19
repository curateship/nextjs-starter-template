import type { ReactNode } from "react"
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"
// Side-effect import: puts every server action in the SSR graph so the RSC
// build registers them all. See src/lib/server-action-registry.ts.
import "@/lib/server-action-registry"

import "@/styles.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import NotFound from "@/screens/not-found"

export const Route = createRootRoute({
  head: () => ({
    links: [],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Directory" },
    ],
  }),
  notFoundComponent: NotFound,
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
