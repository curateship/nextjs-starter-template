import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Check, ChevronRight, Clock, Images, Pencil, Play, Plus, Users } from "lucide-react"

import {
  listExports,
  type ExportItem,
} from "@/lib/api/exports"
import {
  getProjectErrorMessage,
  listProjects,
  type ProjectItem,
} from "@/lib/api/video-projects"
import { listViralVideos, type ViralVideoItem } from "@/lib/api/viral-videos"
import { listCarousels, type CarouselItem } from "@/lib/api/carousels"
import { formatCount } from "@/lib/dashboard-format"
import { cn } from "@/lib/utils"

// -------------------------------------------------------------------------
// Home dashboard — "Activity Feed" layout (design 1B): a resume-hero row of
// recent/in-progress work, then a two-column body pairing a unified activity
// timeline with the trending-archive table. There is no single activity
// endpoint, so the feed is merged client-side from recent projects, finished
// exports, and ingested viral videos. Fields the backend does not track
// (render %, trend deltas) are not shown — only real values.
// -------------------------------------------------------------------------

const RENDER_POLL_MS = 5_000
const HERO_LIMIT = 7
const ACTIVITY_LIMIT = 9
const TRENDING_LIMIT = 5

type Tone = "amber" | "emerald" | "neutral"

type Loaded = {
  projects: ProjectItem[]
  exports: ExportItem[]
  videos: ViralVideoItem[]
  carousels: CarouselItem[]
}

export function HomeDashboard() {
  const navigate = useNavigate()
  const [data, setData] = React.useState<Loaded | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const mounted = React.useRef(true)

  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = React.useCallback(async () => {
    try {
      const [projects, exports, videos, carousels] = await Promise.all([
        listProjects(),
        listExports(),
        listViralVideos(),
        listCarousels({ pageSize: 12, sortBy: "updated_at", sortDirection: "desc" }),
      ])
      if (!mounted.current) return
      setData({
        projects: projects.projects,
        exports: exports.exports,
        videos: videos.videos,
        carousels: carousels.carousels,
      })
      setError(null)
    } catch (loadError) {
      if (!mounted.current) return
      setError(getProjectErrorMessage(loadError))
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  // Keep render statuses fresh while anything is exporting.
  const hasActiveRender = data?.projects.some(
    (p) => p.render_status === "queued" || p.render_status === "rendering"
  )
  React.useEffect(() => {
    if (!hasActiveRender) return
    const id = setInterval(() => void load(), RENDER_POLL_MS)
    return () => clearInterval(id)
  }, [hasActiveRender, load])

  const heroItems = React.useMemo(() => (data ? buildHeroItems(data) : []), [data])
  const activitySections = React.useMemo(
    () => (data ? buildActivity(data) : []),
    [data]
  )
  const trending = React.useMemo(() => (data ? buildTrending(data) : []), [data])

  const loading = !data && !error

  return (
    <div className="space-y-[var(--shell-gutter,0.75rem)]">
      {/* Title row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Pick up where you left off
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything since yesterday, in one stream.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: "/admin/video-editor" })}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" />
          New project
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Hero — resume cards. Full-width responsive grid, capped small. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-[var(--shell-gutter,0.75rem)]">
        {loading
          ? null
          : heroItems.map((item) => (
              <HeroCard
                key={item.id}
                item={item}
                onOpen={() =>
                  item.kind === "reel"
                    ? void navigate({
                        to: "/admin/video-editor/$projectId",
                        params: { projectId: item.id },
                      })
                    : void navigate({
                        to: "/admin/carousels/$carouselId",
                        params: { carouselId: item.id },
                      })
                }
              />
            ))}
        <button
          type="button"
          onClick={() => void navigate({ to: "/admin/video-editor" })}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center transition-colors hover:bg-muted"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Plus className="size-5" />
          </span>
          <span className="text-[13px] font-semibold text-foreground">Start a new reel</span>
          <span className="text-[11px] text-muted-foreground">Reel or carousel</span>
        </button>
      </div>

      {/* Body — activity timeline + trending archive */}
      <div className="grid grid-cols-1 items-start gap-[var(--shell-gutter,0.75rem)] lg:grid-cols-2">
        <ActivityCard loading={loading} sections={activitySections} />
        <TrendingCard
          loading={loading}
          rows={trending}
          onOpenArchive={() => void navigate({ to: "/admin/viral-archive" })}
        />
      </div>
    </div>
  )
}

// --------------------------------------------------------------- derive ----

type HeroItem = {
  id: string
  kind: "reel" | "carousel"
  title: string
  meta: string
  status: "draft" | "queued" | "exporting" | "ready" | "error" | null
  thumbnailUrl: string | null
  durationLabel: string | null
  updatedAt: string
}

function buildHeroItems({ projects, exports, carousels }: Loaded): HeroItem[] {
  const latestExport = new Map<string, ExportItem>()
  for (const e of exports) {
    if (!latestExport.has(e.project_id)) latestExport.set(e.project_id, e)
  }

  const reels: HeroItem[] = projects.map((p) => {
    const exp = latestExport.get(p.id)
    const status = STATUS_MAP[p.render_status]
    return {
      id: p.id,
      kind: "reel",
      title: p.name || "Untitled reel",
      meta:
        p.render_status === "ready" && exp
          ? `Exported ${relativeAge(exp.exported_at)}`
          : `Edited ${relativeAge(p.updated_at)}`,
      status,
      thumbnailUrl: p.render_status === "ready" ? exp?.thumbnail_url ?? null : null,
      durationLabel: p.duration_ms > 0 ? formatDuration(p.duration_ms) : null,
      updatedAt: p.updated_at,
    }
  })

  const carouselItems: HeroItem[] = carousels.map((c) => ({
    id: c.id,
    kind: "carousel",
    title: c.name || "Untitled carousel",
    meta: `${c.slide_count} slide${c.slide_count === 1 ? "" : "s"} · edited ${relativeAge(c.updated_at)}`,
    status: null,
    thumbnailUrl: c.thumbnail_url,
    durationLabel: null,
    updatedAt: c.updated_at,
  }))

  return [...reels, ...carouselItems]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, HERO_LIMIT)
}

const STATUS_MAP: Record<ProjectItem["render_status"], HeroItem["status"]> = {
  idle: "draft",
  queued: "queued",
  rendering: "exporting",
  ready: "ready",
  error: "error",
}

type ActivityEntry = {
  key: string
  ts: string
  tone: Tone
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  detail: string
  meta: string
}

function buildActivity({ projects, exports, videos }: Loaded) {
  const entries: ActivityEntry[] = []

  for (const e of exports) {
    entries.push({
      key: `export-${e.id}`,
      ts: e.exported_at,
      tone: "emerald",
      icon: Check,
      title: "Export finished",
      detail: ` — ${e.name}`,
      meta: joinDot([formatBytes(e.file_size), relativeAge(e.exported_at)]),
    })
  }

  const edits: ActivityEntry[] = []
  for (const p of projects) {
    if (p.render_status === "rendering" || p.render_status === "queued") {
      entries.push({
        key: `render-${p.id}`,
        ts: p.updated_at,
        tone: "amber",
        icon: Clock,
        title: p.render_status === "rendering" ? "Rendering" : "Queued for export",
        detail: ` — ${p.name}`,
        meta: relativeAge(p.updated_at),
      })
    } else {
      edits.push({
        key: `edit-${p.id}`,
        ts: p.updated_at,
        tone: "neutral",
        icon: Pencil,
        title: "Edited",
        detail: ` — ${p.name}`,
        meta: relativeAge(p.updated_at),
      })
    }
  }
  // Projects arrive newest-first; keep only the most recent handful of edits
  // so the feed isn't drowned by them.
  entries.push(...edits.slice(0, 5))

  for (const v of videos.slice(0, 6)) {
    const handle = v.creator?.username
      ? `@${v.creator.username}`
      : v.author ?? "A creator"
    const tags = v.structure_tags.slice(0, 2).join(" + ")
    entries.push({
      key: `ingest-${v.id}`,
      ts: v.created_at,
      tone: "neutral",
      icon: Users,
      title: handle,
      detail: ` — new reel ingested${v.status === "ready" ? " & analyzed" : ""}`,
      meta: joinDot([tags || null, relativeAge(v.created_at)]),
    })
  }

  const sorted = entries
    .sort((a, b) => +new Date(b.ts) - +new Date(a.ts))
    .slice(0, ACTIVITY_LIMIT)

  const buckets: { label: string; items: ActivityEntry[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ]
  for (const entry of sorted) {
    buckets[dayBucketIndex(entry.ts)].items.push(entry)
  }
  return buckets.filter((b) => b.items.length > 0)
}

type TrendEntry = {
  id: string
  rank: number
  thumbnailUrl: string | null
  title: string
  handle: string
  velocity: string
  views: string
  score: number | null
  confidence: "high" | "medium" | "low" | null
}

function buildTrending({ videos }: Loaded): TrendEntry[] {
  // Rank strictly by views/day (what the card claims), so only reels with a
  // measured velocity appear — not lifetime-view totals on the same axis.
  const ranked = videos
    .filter((v) => v.trend_score?.views_per_day != null)
    .sort(
      (a, b) =>
        (b.trend_score?.views_per_day ?? 0) - (a.trend_score?.views_per_day ?? 0)
    )
    .slice(0, TRENDING_LIMIT)

  return ranked.map((v, i) => ({
    id: v.id,
    rank: i + 1,
    thumbnailUrl: v.thumbnail_url,
    title: v.title || "Untitled reel",
    handle: v.creator?.username
      ? `@${v.creator.username}${v.structure_tags[0] ? ` · ${v.structure_tags[0].toLowerCase()}` : ""}`
      : v.author ?? "",
    velocity: v.trend_score?.views_per_day != null ? formatCount(v.trend_score.views_per_day) : "—",
    views: formatCount(v.stats?.views),
    score: v.trend_score?.score != null ? Math.round(v.trend_score.score) : null,
    confidence: v.trend_score?.confidence ?? null,
  }))
}

// --------------------------------------------------------------- format ----

function formatDuration(ms: number) {
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatBytes(bytes: number | null): string | null {
  if (bytes == null) return null
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (sec < 45) return "just now"
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day === 1) return "yesterday"
  if (day < 7) return `${day}d ago`
  const wk = Math.round(day / 7)
  if (wk < 5) return `${wk}w ago`
  const mo = Math.round(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.round(day / 365)}y ago`
}

function dayBucketIndex(iso: string): number {
  const t = new Date(iso).getTime()
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (t >= startToday) return 0
  if (t >= startToday - 86_400_000) return 1
  return 2
}

function joinDot(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" · ")
}

const GRADIENTS = [
  "linear-gradient(150deg,oklch(0.42 0 0),oklch(0.2 0 0))",
  "linear-gradient(150deg,oklch(0.55 0.02 250),oklch(0.3 0.02 250))",
  "linear-gradient(150deg,oklch(0.5 0.03 30),oklch(0.28 0.03 30))",
  "linear-gradient(150deg,oklch(0.46 0.03 330),oklch(0.26 0.03 330))",
  "linear-gradient(150deg,oklch(0.45 0.02 260),oklch(0.25 0.02 260))",
]

function gradientFor(id: string) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return GRADIENTS[hash % GRADIENTS.length]
}

// ----------------------------------------------------------------- hero ----

function HeroCard({ item, onOpen }: { item: HeroItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-foreground/20"
    >
      <div className="relative aspect-[2/3]" style={{ background: gradientFor(item.id) }}>
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
          />
        ) : item.kind === "carousel" ? (
          <Images className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-white/85" />
        ) : null}

        {item.status ? <StatusBadge status={item.status} /> : null}
        <MediaPill icon={item.kind === "carousel" ? Images : Play}>
          {item.kind === "carousel" ? "Carousel" : "Reel"}
        </MediaPill>
        {item.kind === "reel" && !item.thumbnailUrl ? (
          <Play className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 fill-white text-white opacity-85" />
        ) : null}
        {item.durationLabel ? (
          <span className="absolute bottom-2.5 right-2.5 rounded-[5px] bg-black/40 px-1.5 py-0.5 text-[10.5px] text-white">
            {item.durationLabel}
          </span>
        ) : null}
      </div>
      <div className="px-3 py-2.5">
        <div className="truncate text-[12.5px] font-semibold text-foreground">{item.title}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{item.meta}</div>
      </div>
    </button>
  )
}

function StatusBadge({ status }: { status: NonNullable<HeroItem["status"]> }) {
  if (status === "ready") {
    return (
      <span className="absolute left-2.5 top-2.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
        Ready
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="absolute left-2.5 top-2.5 rounded-full bg-rose-100 px-2 py-0.5 text-[10.5px] font-semibold text-rose-700">
        Error
      </span>
    )
  }
  return (
    <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur-sm">
      {status === "exporting" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />
      ) : null}
      {status === "exporting" ? "Exporting" : status === "queued" ? "Queued" : "Draft"}
    </span>
  )
}

function MediaPill({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-[5px] bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white">
      <Icon className="size-2.5" />
      {children}
    </span>
  )
}

// ------------------------------------------------------------- activity ----

const TONE_DOT: Record<Tone, string> = {
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
  neutral: "bg-muted text-muted-foreground",
}

function ActivityCard({
  loading,
  sections,
}: {
  loading: boolean
  sections: { label: string; items: ActivityEntry[] }[]
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Activity</span>
        <div className="flex gap-1 text-[11px]">
          <span className="rounded-full bg-accent px-2.5 py-1 font-medium text-foreground">All</span>
          <span className="px-2.5 py-1 text-muted-foreground">Renders</span>
          <span className="px-2.5 py-1 text-muted-foreground">Ingests</span>
        </div>
      </div>

      {loading ? (
        null
      ) : sections.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">No recent activity yet.</p>
      ) : (
        sections.map((section) => (
          <React.Fragment key={section.label}>
            <div className="mb-2 mt-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </div>
            <div className="relative pl-[26px]">
              <span className="absolute bottom-1 left-2 top-1 w-px bg-border" />
              {section.items.map((item, i) => (
                <TimelineRow key={item.key} item={item} last={i === section.items.length - 1} />
              ))}
            </div>
          </React.Fragment>
        ))
      )}
    </div>
  )
}

function TimelineRow({ item, last }: { item: ActivityEntry; last: boolean }) {
  const { icon: Icon, tone, title, detail, meta } = item
  return (
    <div className={cn("relative", !last && "pb-4")}>
      <span
        className={cn(
          "absolute -left-6 top-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-card shadow-[0_0_0_1px_var(--border)]",
          TONE_DOT[tone]
        )}
      >
        <Icon className="size-2.5" strokeWidth={2.75} />
      </span>
      <div className="text-[12.5px] text-foreground">
        <span className="font-semibold">{title}</span>
        {detail}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{meta}</div>
    </div>
  )
}

// ------------------------------------------------------------- trending ----

const TREND_COLS = "grid-cols-[24px_40px_1fr_72px_72px_52px]"

function TrendingCard({
  loading,
  rows,
  onOpenArchive,
}: {
  loading: boolean
  rows: TrendEntry[]
  onOpenArchive: () => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Trending in your archive</span>
          <span className="text-[11px] text-muted-foreground">by views / day</span>
        </div>
        <button
          type="button"
          onClick={onOpenArchive}
          className="flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Open archive
          <ChevronRight className="size-3" />
        </button>
      </div>

      <div
        className={cn(
          "grid items-center gap-2.5 border-t border-border/60 px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground",
          TREND_COLS
        )}
      >
        <span>#</span>
        <span />
        <span>Reel</span>
        <span className="text-right">Views/day</span>
        <span className="text-right">Views</span>
        <span className="text-right">Score</span>
      </div>

      {loading ? (
        null
      ) : rows.length === 0 ? (
        <p className="border-t border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
          No analyzed reels yet.
        </p>
      ) : (
        rows.map((row) => (
          <div
            key={row.id}
            className={cn("grid items-center gap-2.5 border-t border-border/60 px-4 py-2", TREND_COLS)}
          >
            <span className="text-[13px] font-semibold text-muted-foreground">{row.rank}</span>
            <div
              className="h-10 w-7 overflow-hidden rounded-[5px]"
              style={{ background: gradientFor(row.id) }}
            >
              {row.thumbnailUrl ? (
                <img src={row.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold text-foreground">{row.title}</div>
              <div className="truncate text-[11px] text-muted-foreground">{row.handle}</div>
            </div>
            <span className="text-right text-[11.5px] font-semibold text-foreground">
              {row.velocity}
            </span>
            <span className="text-right text-xs text-foreground/80">{row.views}</span>
            <span
              className={cn(
                "text-right text-[11.5px] font-semibold",
                row.confidence === "high"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : row.confidence === "low"
                    ? "text-muted-foreground"
                    : "text-foreground"
              )}
            >
              {row.score ?? "—"}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
