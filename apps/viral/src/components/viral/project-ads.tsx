import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CopyIcon, ExternalLinkIcon, Loader2Icon, MegaphoneIcon, PenLineIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { InspectorCard } from "@/components/shared/inspector-card"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadAdCopiesFn, writeAdCopyFn, type AdCopies, type AdCopy, type WinningAd } from "@/lib/api/viral/viral-ads"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { AD_COPY_AIMS, platformNames, WINNING_AD_DAYS } from "@/lib/viral/ads"
import { writerPriceWords } from "@/lib/viral/writers"
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

/**
 * The right panel while an ad is open: its words, who runs it and for how
 * long, and Write an ad like this.
 */
export function AdPanel({ ad, projectId, sample }: { ad: WinningAd | null; projectId: string; sample: boolean }) {
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
          <AdCopyCards projectId={projectId} adArchiveId={ad.adArchiveId} sample={sample} />
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

type Copies = { state: "loading" } | ({ state: "ready" } & AdCopies) | { state: "failed"; error: string }

/**
 * Write an ad like this (`workspace/docs/winning-ads.md`, more-features task
 * part 10). Tyler, 6 Nov 2026: "Meta's three boxes". One press writes the
 * main text, the headline and the description for the project's topic,
 * each with Copy. The written ads are kept by the ad's library id, so they
 * are still here after Search ads runs again. A sample's ads are made up,
 * so the button is left off them.
 */
export function AdCopyCards({ projectId, adArchiveId, sample }: { projectId: string; adArchiveId: string; sample: boolean }) {
  const [copies, setCopies] = React.useState<Copies>({ state: "loading" })
  const [reloads, setReloads] = React.useState(0)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let live = true
    loadAdCopiesFn(projectId, adArchiveId)
      .then((answer) => {
        if (live) setCopies({ state: "ready", ...answer })
      })
      .catch((error) => {
        if (live) setCopies({ state: "failed", error: getViralErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [projectId, adArchiveId, reloads])

  async function write() {
    setBusy(true)
    dismissErrorToast()
    try {
      const written = await writeAdCopyFn(projectId, adArchiveId)
      setCopies((was) => (was.state === "ready" ? { ...was, copies: [written, ...was.copies] } : was))
      toast.success("The ad is written.")
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const priceLine = copies.state === "ready" ? writerPriceWords(copies.price) : null

  return (
    <InspectorCard
      storageId="viral-ad-write"
      title="Write an ad like this"
      description={sample ? undefined : priceLine ? priceLine.charAt(0).toUpperCase() + priceLine.slice(1) : undefined}
    >
      {copies.state === "loading" ? (
        <LoadingRow label="Reading the ads written" />
      ) : copies.state === "failed" ? (
        <ErrorRow message={copies.error} onRetry={() => setReloads((count) => count + 1)} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 text-sm break-words">
          {sample ? (
            <p className="text-muted-foreground">A sample's ads are made up, so nothing is written from them. Search ads in your own project to try it.</p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Main text, headline and description in this ad's style, for your project's topic. Ready to paste into Meta.
              </p>
              <div>
                <Button type="button" onClick={() => void write()} disabled={busy}>
                  {busy ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />}
                  Write an ad
                </Button>
              </div>
            </>
          )}
          {copies.copies.length ? (
            <ul aria-label="Ads written" className="grid gap-4">
              {copies.copies.map((copy) => (
                <AdCopyRow key={copy.id} copy={copy} />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </InspectorCard>
  )
}

function AdCopyRow({ copy }: { copy: AdCopy }) {
  return (
    <li className="grid gap-3 border-t pt-4">
      <p className="text-xs text-muted-foreground">Written {formatShortDay(copy.createdAt)}</p>
      <AdBox label="Main text" text={copy.mainText} aim={AD_COPY_AIMS.mainText} />
      <AdBox label="Headline" text={copy.headline} aim={AD_COPY_AIMS.headline} />
      <AdBox label="Description" text={copy.description} aim={AD_COPY_AIMS.description} />
    </li>
  )
}

/** One of Meta's boxes: its words, how long they are against what Meta shows, and Copy. */
function AdBox({ label, text, aim }: { label: string; text: string; aim: number }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied.`)
    } catch {
      showErrorToast("The text could not be copied. Select it and copy it instead.")
    }
  }
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {label} · <span className="tabular-nums">{text.length}</span> of about {aim} characters
        </p>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Copy the ${label.toLowerCase()}`} onClick={() => void copy()}>
          <CopyIcon />
        </Button>
      </div>
      <p className="whitespace-pre-wrap">{text || "-"}</p>
    </div>
  )
}
