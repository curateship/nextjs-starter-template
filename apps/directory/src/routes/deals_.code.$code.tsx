import * as React from "react"
import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router"
import { CheckCircle2Icon, Loader2Icon, MapPinIcon } from "lucide-react"

import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { QrCode } from "@/components/shared/qr-code"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePageVisible } from "@/lib/api/content/pages"
import {
  getClaimErrorMessage,
  loadClaimPass,
  markCodeUsedAtCounter,
} from "@/lib/api/promotions/claims"
import { directoryTitle } from "@/lib/directory/public-seo"
import { formatDateTime } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { shownHeadline } from "@/lib/promotions/deal-headline"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The page a customer shows at the counter, at /deals/code/K7QX-P2MD.
 *
 * It holds one claim: the QR for the counter to scan, the same code in
 * characters big enough to read aloud, and whether it has been used. The link
 * carries the code and nothing else, so an admin renaming the deal's address
 * never breaks a code that is already in somebody's inbox.
 *
 * Anybody holding the code may open it, which is the point. Marking it used
 * needs an account: the button below is drawn only for the listing's owner or
 * a site admin, and the door checks that again for itself.
 *
 * A code that is not on this site, a deal that has gone back to a draft and a
 * Deals page that is switched off all answer the same not-found page.
 */
export const Route = createFileRoute("/deals_/code/$code")({
  loader: async ({ params }) => {
    const [, pass] = await Promise.all([
      requirePageVisible("/deals"),
      loadClaimPass(params.code),
    ])
    if (!pass) throw notFound()
    return pass
  },
  // A tab title, because this page sits open on a phone in a queue. No
  // description and no sharing card: the code is somebody's own pass and it
  // is never a page for a search engine.
  head: ({ loaderData }) => ({
    meta: [
      { title: directoryTitle("Your code", loaderData?.deal.title) },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ClaimPassRoute,
  errorComponent: DirectoryRouteError,
})

function ClaimPassRoute() {
  const pass = Route.useLoaderData()
  const router = useRouter()
  const [marking, setMarking] = React.useState(false)

  async function markUsed() {
    dismissErrorToast()
    setMarking(true)
    try {
      const answer = await markCodeUsedAtCounter({
        promotionId: pass.deal.id,
        scanned: pass.code,
      })
      // "used" without `justUsed` is somebody at the same counter getting
      // there first, which is not a failure. Anything else is: the claim was
      // taken away, or this account stopped being allowed to, between the
      // page loading and the button being pressed.
      if (!answer.justUsed && answer.state !== "used") {
        showErrorToast("That code could not be marked used. Please try again.")
      }
      await router.invalidate()
    } catch (error) {
      showErrorToast(getClaimErrorMessage(error))
    } finally {
      setMarking(false)
    }
  }

  const used = pass.usedAt !== null

  return (
    <DirectoryFrame>
      <Card>
        <CardContent className="grid justify-items-center gap-4 text-center">
          <header className="grid gap-1">
            <p className="text-2xl leading-tight font-bold wrap-anywhere">
              {shownHeadline(pass.deal.headline)}
            </p>
            <h1 className="text-lg font-semibold">{pass.deal.title}</h1>
          </header>

          {/* White whatever the colour mode, because the squares have to be
              black on white for a camera to read them. */}
          <div className="grid w-full max-w-72 justify-items-center gap-3 rounded-md bg-white p-4">
            <QrCode
              value={pass.url}
              title={`QR code for ${pass.code}`}
              className="size-full max-w-56"
            />
            <span className="font-mono text-xl font-semibold tracking-widest text-black select-all">
              {pass.code}
            </span>
          </div>

          <div className="grid gap-1">
            <p
              role="status"
              className={`text-sm font-medium ${used ? "text-muted-foreground" : ""}`}
            >
              {used
                ? `Already used, ${formatDateTime(pass.usedAt)}`
                : "Not used yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {pass.name}&rsquo;s code, claimed {formatDateTime(pass.claimedAt)}
            </p>
            {pass.deal.ended ? (
              <p className="text-sm font-medium">This deal has ended</p>
            ) : null}
          </div>

          {pass.canUse && !used ? (
            <Button
              type="button"
              disabled={marking}
              onClick={() => void markUsed()}
            >
              {marking ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <CheckCircle2Icon />
              )}
              Mark used
            </Button>
          ) : null}

          <p className="flex items-center justify-center gap-2 text-sm">
            <MapPinIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="grid min-w-0">
              <span className="font-medium">{pass.deal.listingTitle}</span>
              {pass.deal.listingAddress ? (
                <span className="text-muted-foreground">
                  {pass.deal.listingAddress}
                </span>
              ) : null}
            </span>
          </p>

          <Link
            to="/deals/$slug"
            params={{ slug: pass.deal.slug }}
            className={`w-fit rounded-sm text-sm underline-offset-4 hover:underline ${focusRing}`}
          >
            See the deal
          </Link>
        </CardContent>
      </Card>
    </DirectoryFrame>
  )
}
