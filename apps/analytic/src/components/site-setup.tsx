import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, CheckIcon, CopyIcon, Loader2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DashboardToolbar,
  DashboardToolbarTitle,
} from "@/components/dashboard-toolbar"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { TableSurface } from "@/components/ui/table"
import { getSiteInstallStatus, type SiteDetailResponse } from "@/lib/api/sites"

export function SiteSetup({ detail }: { detail: SiteDetailResponse }) {
  const { site } = detail
  const [copied, setCopied] = React.useState(false)
  const [receiving, setReceiving] = React.useState(detail.receivingData)

  // The snippet is served by this app; build the tag from the current origin.
  const snippet = React.useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : ""
    return `<script defer data-site="${site.public_id}" src="${origin}/js/track.js"></script>`
  }, [site.public_id])

  // Poll for the first event until data starts arriving.
  React.useEffect(() => {
    if (receiving) return
    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const status = await getSiteInstallStatus(site.id)
        if (!cancelled && status.receivingData) {
          setReceiving(true)
        }
      } catch {
        // Ignore transient errors; keep polling.
      }
    }, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [receiving, site.id])

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="w-full space-y-2 md:space-y-3">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/sites">
            <ArrowLeftIcon className="size-4" />
            All sites
          </Link>
        </Button>
      </div>

      <TableSurface>
        <DashboardToolbar>
          <DashboardToolbarTitle>
            <span className="text-sm font-medium sm:text-base">
              {site.name}
            </span>
            <span className="text-xs text-muted-foreground">{site.domain}</span>
          </DashboardToolbarTitle>
          {receiving ? (
            <Badge>Receiving data</Badge>
          ) : (
            <Badge variant="secondary">
              <Loader2Icon className="size-3 animate-spin" />
              Waiting for first visit
            </Badge>
          )}
        </DashboardToolbar>

        <div className="space-y-6 p-4 sm:p-6">
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Install the snippet</h2>
            <p className="text-sm text-muted-foreground">
              Paste this just before the closing{" "}
              <code className="font-mono text-xs">&lt;/head&gt;</code> tag on{" "}
              <span className="font-medium">{site.domain}</span>. Once it loads,
              visits start showing up here.
            </p>
            <div className="relative">
              <ScrollArea className="rounded-md border border-border bg-muted/50">
                <pre className="p-4 pr-12 font-mono text-xs leading-relaxed">
                  {snippet}
                </pre>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="absolute top-2 right-2"
                onClick={() => void copySnippet()}
                aria-label="Copy snippet"
                title="Copy snippet"
              >
                {copied ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium">Tracking ID</h2>
            <code className="inline-block rounded bg-muted px-2 py-1 font-mono text-xs">
              {site.public_id}
            </code>
          </section>

          <section className="space-y-1">
            <h2 className="text-sm font-medium">Status</h2>
            <p className="text-sm text-muted-foreground">
              {receiving
                ? "This site is sending data. You're all set."
                : "No data yet. Load a page on your site with the snippet installed — this updates automatically."}
            </p>
          </section>
        </div>
      </TableSurface>
    </div>
  )
}
