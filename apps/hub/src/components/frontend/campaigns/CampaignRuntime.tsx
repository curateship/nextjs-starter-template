"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { splitCampaignEventBatches, type PopupCampaignContent, type PublicCampaign } from "@/lib/campaigns/campaigns"
import { sanitizeUrl } from "@/lib/utils/url-validator"

type CampaignEventType = "campaign_view" | "campaign_dismiss" | "campaign_submit"
type CampaignEvent = { type: CampaignEventType; campaign_id: string; page_path: string }

let pendingEvents: CampaignEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flushCampaignEvents() {
  if (!pendingEvents.length || typeof navigator === "undefined") return
  const batches = splitCampaignEventBatches(pendingEvents)
  pendingEvents = []
  for (const events of batches) {
    const body = JSON.stringify({ events })
    if (!navigator.sendBeacon?.("/api/analytics/track", new Blob([body], { type: "application/json" }))) {
      fetch("/api/analytics/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined)
    }
  }
}

function queueCampaignEvent(type: CampaignEventType, campaignId: string, path: string) {
  pendingEvents.push({ type, campaign_id: campaignId, page_path: path })
  if (flushTimer) return
  flushTimer = setTimeout(() => { flushTimer = null; flushCampaignEvents() }, 500)
}

function getStorage(campaign: PublicCampaign) {
  if (typeof window === "undefined" || campaign.frequency === "every_visit") return null
  return campaign.frequency === "once_per_session" ? window.sessionStorage : window.localStorage
}

function isCapped(campaign: PublicCampaign) {
  const storage = getStorage(campaign)
  if (!storage) return false
  return storage.getItem(`campaign:${campaign.id}:dismissed`) === "1"
    || storage.getItem(`campaign:${campaign.id}:submitted`) === "1"
}

function setCap(campaign: PublicCampaign, outcome: "dismissed" | "submitted") {
  try { getStorage(campaign)?.setItem(`campaign:${campaign.id}:${outcome}`, "1") } catch { /* Storage may be unavailable. */ }
}

function AnnouncementBars({ campaigns, path }: { campaigns: PublicCampaign[]; path: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const viewed = useRef(new Set<string>())
  const visible = campaigns.filter((campaign) => !dismissed.has(campaign.id) && !isCapped(campaign))

  useEffect(() => { setDismissed(new Set()) }, [path])

  useEffect(() => {
    const element = ref.current
    const setHeight = () => document.documentElement.style.setProperty("--campaign-bar-height", `${element?.getBoundingClientRect().height ?? 0}px`)
    setHeight()
    const observer = typeof ResizeObserver !== "undefined" && element ? new ResizeObserver(setHeight) : null
    if (observer && element) observer.observe(element)
    return () => { observer?.disconnect(); document.documentElement.style.setProperty("--campaign-bar-height", "0px") }
  }, [visible.length])

  useEffect(() => {
    visible.forEach((campaign) => {
      const key = `${path}:${campaign.id}`
      if (viewed.current.has(key)) return
      viewed.current.add(key)
      queueCampaignEvent("campaign_view", campaign.id, path)
    })
  }, [path, visible])

  if (!visible.length) return null

  return (
    <div ref={ref} data-announcement-bars className="fixed inset-x-0 top-0 z-[70] flex flex-col">
      {visible.map((campaign) => {
        if (campaign.type !== "bar") return null
        const content = campaign.content
        return (
          <div key={campaign.id} className="relative flex min-h-10 items-center justify-center gap-3 bg-foreground px-10 py-2 text-center text-sm text-background">
            <span>{content.text}</span>
            {content.ctaLabel && content.ctaUrl && <a href={sanitizeUrl(content.ctaUrl, "#")} className="font-semibold underline underline-offset-4">{content.ctaLabel}</a>}
            <button
              type="button"
              className="absolute right-2 inline-flex size-8 items-center justify-center rounded-md hover:bg-background/15 focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={`Dismiss ${campaign.name}`}
              onClick={() => {
                setCap(campaign, "dismissed")
                setDismissed((current) => new Set(current).add(campaign.id))
                queueCampaignEvent("campaign_dismiss", campaign.id, path)
              }}
            ><X className="size-4" /></button>
          </div>
        )
      })}
    </div>
  )
}

function CampaignPopup({ campaign, path }: { campaign: PublicCampaign; path: string }) {
  const [open, setOpen] = useState(false)
  const [finished, setFinished] = useState(false)
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const triggered = useRef(false)
  const content = campaign.content as PopupCampaignContent

  useEffect(() => {
    triggered.current = false
    setOpen(false)
    setFinished(false)
    if (isCapped(campaign)) return

    const show = () => {
      if (triggered.current || isCapped(campaign)) return
      triggered.current = true
      setOpen(true)
      queueCampaignEvent("campaign_view", campaign.id, path)
    }

    if (campaign.trigger.type === "delay") {
      const timer = window.setTimeout(show, campaign.trigger.value * 1000)
      return () => window.clearTimeout(timer)
    }
    if (campaign.trigger.type === "scroll") {
      const triggerValue = campaign.trigger.value
      const onScroll = () => {
        const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
        if ((window.scrollY / scrollable) * 100 >= triggerValue) show()
      }
      window.addEventListener("scroll", onScroll, { passive: true })
      onScroll()
      return () => window.removeEventListener("scroll", onScroll)
    }
    if (!window.matchMedia("(min-width: 768px) and (hover: hover)").matches) return
    const onExit = (event: MouseEvent) => {
      if (event.clientY <= 0 && !event.relatedTarget) show()
    }
    document.addEventListener("mouseout", onExit)
    return () => document.removeEventListener("mouseout", onExit)
  }, [campaign, path])

  const dismiss = () => {
    if (!open || finished) { setOpen(false); return }
    setCap(campaign, "dismissed")
    queueCampaignEvent("campaign_dismiss", campaign.id, path)
    setOpen(false)
  }

  const subscribe = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    const response = await fetch("/api/campaigns/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId: campaign.siteId, campaignId: campaign.id, email }),
    }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setSubmitting(false)
    if (!response?.ok || !result?.success) { setError(result?.error || "Unable to subscribe. Try again."); return }
    setCap(campaign, "submitted")
    queueCampaignEvent("campaign_submit", campaign.id, path)
    setFinished(true)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => next ? setOpen(true) : dismiss()}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl" aria-describedby="campaign-popup-description">
        {content.imageUrl && <>
          {/* Campaign media may use site-configured external hosts that Next Image cannot predeclare. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sanitizeUrl(content.imageUrl, "")} alt="" className="max-h-64 w-full object-cover" />
        </>}
        <div className="space-y-5 p-6 pt-2">
          <DialogHeader>
            <DialogTitle className="text-2xl">{content.heading}</DialogTitle>
            <DialogDescription id="campaign-popup-description" className="text-base">{content.text}</DialogDescription>
          </DialogHeader>
          {finished ? (
            <p role="status" className="rounded-md bg-muted p-4 text-sm font-medium">{content.successMessage}</p>
          ) : content.goal === "email" ? (
            <form onSubmit={subscribe} className="space-y-3">
              <label htmlFor={`campaign-email-${campaign.id}`} className="sr-only">Email address</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id={`campaign-email-${campaign.id}`} type="email" autoComplete="email" required maxLength={255} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : content.submitLabel}</Button>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </form>
          ) : (
            <Button asChild><a href={sanitizeUrl(content.ctaUrl, "#")} onClick={() => {
              setCap(campaign, "submitted")
              queueCampaignEvent("campaign_submit", campaign.id, path)
            }}>{content.ctaLabel}</a></Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CampaignRuntime({ bars, popup, path }: {
  bars: PublicCampaign[]
  popup: PublicCampaign | null
  path: string
}) {
  useEffect(() => {
    const flush = () => flushCampaignEvents()
    window.addEventListener("pagehide", flush)
    return () => window.removeEventListener("pagehide", flush)
  }, [])

  return <>
    <AnnouncementBars campaigns={bars} path={path} />
    {popup && <CampaignPopup key={`${path}:${popup.id}`} campaign={popup} path={path} />}
  </>
}
