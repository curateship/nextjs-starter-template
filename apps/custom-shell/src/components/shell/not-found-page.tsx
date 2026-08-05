import { getRouteApi, useRouterState } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { useAppName } from "@/lib/branding"

const authenticatedRoute = getRouteApi("/_authenticated")

export function PublicNotFound() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <PublicPageFrame>
      <NotFoundCard
        homeHref={pathname === "/admin" || pathname.startsWith("/admin/") ? "/admin" : "/"}
      />
    </PublicPageFrame>
  )
}

export function AuthenticatedNotFound() {
  const appName = useAppName()
  const { user } = authenticatedRoute.useLoaderData()
  const homeHref = user.role === "admin" ? "/admin" : "/home"

  return <NotFoundCard appName={appName} homeHref={homeHref} />
}

function NotFoundCard({
  appName,
  homeHref,
}: {
  appName?: string
  homeHref: string
}) {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>That page does not exist</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {appName
            ? `${appName} could not find the page you requested.`
            : "We could not find the page you requested."}
        </p>
        <Button asChild>
          <a href={homeHref}>Go home</a>
        </Button>
      </CardContent>
    </Card>
  )
}
