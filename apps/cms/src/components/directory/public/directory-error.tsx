import { useRouter, type ErrorComponentProps } from "@tanstack/react-router"

import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getPublicDirectoryErrorMessage } from "@/lib/api/directory/public"

/**
 * What a visitor sees when a public directory page fails to load.
 *
 * It exists for one reason: the router's last resort prints the error's own
 * text, and the server's text is written for an admin — a database failure
 * would be handed to a stranger word for word. This says one flat sentence
 * instead, and offers the way out.
 *
 * A card rather than the shell's `ErrorBanner`, which draws nothing and raises
 * a toast. That is right on a dashboard, where the page around it is still
 * there; here the page is empty, and a stranger looking at a blank screen with
 * a toast fading out of it has been told nothing.
 *
 * Not-found never reaches here — a loader that throws `notFound()` goes to the
 * not-found page — so this really is only for a failure.
 */
export function DirectoryRouteError({ error }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <DirectoryFrame>
      <Card>
        <CardContent className="grid justify-items-start gap-2">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            {getPublicDirectoryErrorMessage(error)}
          </p>
          <Button type="button" onClick={() => void router.invalidate()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </DirectoryFrame>
  )
}
