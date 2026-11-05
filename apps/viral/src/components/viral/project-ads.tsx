import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CopyIcon, ExternalLinkIcon, Loader2Icon, MegaphoneIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { InspectorCard } from "@/components/shared/inspector-card"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { WinningAd } from "@/lib/api/viral/viral-ads"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { platformNames, WINNING_AD_DAYS } from "@/lib/viral/ads"
import type { AdsState } from "@/components/viral/use-project-ads"
import { formatShortDay } from "@/lib/viral/viral-view"

/**
 * The middle panel while the Ads row is picked: the ads newest first, in the
 * server's order, which is also the order the page opens the first one from.
 */
export function AdsMiddle({
  ads,
  searching,
  sample,
  openId,
  onSearch,
  onRetry,
  onPick,
  onBack,
}: {
  ads: AdsState
  searching: boolean
  sample: boolean
  openId: string | null
  onSearch: () => void
  onRetry: () => void
  onPick: (ad: WinningAd) => void
  onBack: () => void
}) {
  const list = ads.state === "ready" ? ads.ads : []
  return (
    <>
      <DashboardCardTitleHeader
        back={{ label: "Back to the videos", onClick: onBack }}
        title="Winning ads"
        meta={
          ads.state === "ready"
            ? `${ads.ads.length} ${plural(ads.ads.length, "ad")}${ads.searchedAt ? ` · searched ${formatShortDay(ads.searchedAt)}` : ""}`
            : undefined
        }
        action={
          sample ? undefined : (
            <Button type="button" variant="outline" size="sm" disabled={searching} onClick={onSearch}>
              {searching ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
              <span className="@max-3xl:sr-only">Search ads</span>
            </Button>
          )
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        {ads.state === "loading" ? (
          <LoadingRow label="Reading the ads" />
        ) : ads.state === "failed" ? (
          <div className="p-3">
            <ErrorRow message={ads.error} onRetry={onRetry} />
          </div>
        ) : (
          <>
            {ads.error ? (
              <div className="p-3">
                <ErrorRow message={`The last search failed: ${ads.error}`} onRetry={onSearch} />
              </div>
            ) : null}
            {list.length ? (
              <ul aria-label="Winning ads" className="grid grid-cols-[minmax(0,1fr)]">
                {list.map((ad) => (
                  <li key={ad.id} className={cn("border-b", ad.id === openId ? "bg-muted" : "hover:bg-muted/50")}>
                    <button
                      type="button"
                      aria-current={ad.id === openId ? "true" : undefined}
                      onClick={() => onPick(ad)}
                      className={cn("flex w-full min-w-0 items-start gap-3 px-3 py-3 text-left", focusRing)}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
                        <MegaphoneIcon className="size-4 text-muted-foreground" aria-hidden />
                      </span>
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="truncate text-sm font-medium">{ad.title || ad.pageName || "An ad"}</span>
                        <span className="line-clamp-2 text-sm text-muted-foreground">{ad.body}</span>
                        <span className="truncate text-xs text-muted-foreground tabular-nums">
                          {[ad.pageName, `${ad.daysRunning} days running`, platformNames(ad.platforms)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : !ads.tokenSet && !sample ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                Paste a Meta token in{" "}
                <Link to="/admin/settings/$tab" params={{ tab: "meta" }} className="underline">
                  Settings → Meta
                </Link>
                , then press Search ads.
              </p>
            ) : (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                {ads.searchedAt
                  ? `No ad has run ${WINNING_AD_DAYS} days or more for this project's keywords.`
                  : "Press Search ads to look for ads running in this niche."}
              </p>
            )}
          </>
        )}
      </ScrollArea>
    </>
  )
}

/** The right panel while an ad is open: its words, who runs it and for how long. */
export function AdPanel({ ad }: { ad: WinningAd | null }) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  if (!ad) {
    return (
      <>
        <DashboardCardTitleHeader icon={<MegaphoneIcon />} title="Ad" />
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">Click an ad to read it here.</p>
      </>
    )
  }

  async function copy(current: WinningAd) {
    try {
      await navigator.clipboard.writeText([current.title, current.body].filter(Boolean).join("\n\n"))
      toast.success("Ad text copied.")
    } catch {
      showErrorToast("The text could not be copied. Select it and copy it instead.")
    }
  }

  return (
    <>
      <DashboardCardTitleHeader
        icon={<MegaphoneIcon />}
        title={
          <span className="grid leading-tight">
            <span className="truncate">{ad.pageName || "An ad"}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{ad.daysRunning} days running</span>
          </span>
        }
        action={
          <FoldingMenu label="More for this ad" fit align="end" open={menuOpen} onOpenChange={setMenuOpen}>
            <MenuAction
              icon={<ExternalLinkIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                window.open(ad.libraryUrl, "_blank", "noopener,noreferrer")
              }}
            >
              Open in Meta's ad library
            </MenuAction>
            <MenuAction
              icon={<CopyIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                void copy(ad)
              }}
            >
              Copy the text
            </MenuAction>
          </FoldingMenu>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          <InspectorCard storageId="viral-ad-words" title="The ad">
            <div className="grid gap-2 text-sm break-words">
              {ad.title ? <p className="font-medium">{ad.title}</p> : null}
              <p className="whitespace-pre-wrap">{ad.body || "This ad has no words, only a picture or video."}</p>
            </div>
          </InspectorCard>
          <InspectorCard storageId="viral-ad-details" title="Details">
            <dl className="grid gap-2 text-sm">
              <Detail label="Running since" value={formatShortDay(ad.startedAt)} />
              <Detail label="Days running" value={String(ad.daysRunning)} />
              <Detail label="Shown on" value={platformNames(ad.platforms) || "-"} />
              <Detail label="Found by" value={ad.keyword ? `"${ad.keyword}"` : "-"} />
            </dl>
          </InspectorCard>
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t p-3">
        <Button asChild variant="outline" className="w-full min-w-0">
          <a href={ad.libraryUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon />
            <span className="min-w-0 truncate">See its picture or video on Meta</span>
          </a>
        </Button>
      </div>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  )
}
