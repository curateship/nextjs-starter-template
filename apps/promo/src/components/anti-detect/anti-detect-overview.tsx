import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import type { AntiDetectData } from "@/components/anti-detect/anti-detect-dashboard"
import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import { Button } from "@/components/ui/button"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { ANTI_DETECT_WIDGET_OFFER, findAntiDetectWidget, type AntiDetectWidgetId } from "@/lib/anti-detect/page"
import type { ProjectReach } from "@/lib/anti-detect/project-reach"
import { browserWords, proxyTestOf, rackCounts, rackStateWords } from "@/lib/anti-detect/rows"
import { antiDetectSectionSearch, NO_GROUP, type AntiDetectSearch, type AntiDetectSection } from "@/lib/anti-detect/search"
import {
  answerUnknownScreen,
  getBansErrorMessage,
  loadUnknownScreenPicture,
  releaseAppBrake,
  type BansPage,
} from "@/lib/api/bans"
import { appName } from "@/lib/bans/options"
import { proxyCostTotalText } from "@/lib/browser/wording"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { handleWords } from "@/lib/social/networks"
import { showErrorToast } from "@/lib/toast/error-toast"

const DAY_MS = 86_400_000

/** "3 bans", "1 phone". */
const counted = (count: number, one: string) => `${count} ${plural(count, one)}`

/**
 * The Anti Detect dashboard's Overview (Tyler, 12 Nov 2026): the person's
 * own widgets in the shell's grid, straight on the dashboard beside the left
 * page, each in the shell's widget card with its ⋮. His picks: "Browsers and
 * proxies, Racks, Bans in 30 days, Waiting on you". Each row opens where its
 * work is. A project picked in the Projects block narrows every widget to
 * what its accounts use.
 */
export function AntiDetectOverview({
  data,
  reach,
  projectId,
  layout,
  onChange,
}: {
  data: AntiDetectData
  reach: ProjectReach | null
  projectId: string
  layout: WidgetLayout
  onChange: (layout: WidgetLayout) => void
}) {
  const navigate = useNavigate({ from: "/admin/anti-detect" })
  const router = useRouter()
  const keep = projectId ? { project: projectId } : {}
  const go = (section: AntiDetectSection, rest: Partial<AntiDetectSearch> = {}) =>
    void navigate({ search: antiDetectSectionSearch(section, { ...keep, ...rest }) })
  const refresh = async () => {
    await router.invalidate()
  }

  const draw = (id: AntiDetectWidgetId) => {
    switch (id) {
      case "browsers-proxies":
        return <BrowsersWidget data={data} reach={reach} go={go} />
      case "racks":
        return <RacksWidget data={data} reach={reach} go={go} />
      case "bans-30-days":
        return <BansWidget page={data.bans} projectId={projectId} go={go} />
      case "waiting-on-you":
        return <WaitingWidget page={data.bans} projectId={projectId} onChanged={refresh} />
    }
  }

  return (
    <WidgetGrid
      offer={ANTI_DETECT_WIDGET_OFFER}
      layout={layout}
      onChange={onChange}
      drawWidget={(id) => {
        const widget = findAntiDetectWidget(id)
        if (!widget) return null
        const Icon = widget.icon
        return (
          <WidgetCard title={widget.label} icon={<Icon />} menu={<WidgetMenu title={widget.label} />}>
            {draw(widget.id)}
          </WidgetCard>
        )
      }}
    />
  )
}

type Go = (section: AntiDetectSection, rest?: Partial<AntiDetectSearch>) => void

/** A widget's list that scrolls inside its card. */
function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid p-1.5">{children}</div>
    </ScrollArea>
  )
}

/** A small muted heading over a part of a widget's list. */
function Part({ children }: { children: React.ReactNode }) {
  return <p className="px-1.5 pt-2 pb-1 text-xs text-muted-foreground">{children}</p>
}

/** The widget's one line when there is nothing to show. */
function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="px-1.5 py-1.5 text-sm text-muted-foreground">{children}</p>
}

/** A row that opens where its work is, with its figure in a pill. */
function Row({ title, line, value, onPress }: { title: string; line?: string | null; value?: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={onPress}
    >
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{title}</span>
        {line ? <span className="truncate text-xs text-muted-foreground">{line}</span> : null}
      </span>
      {value ? <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">{value}</span> : null}
    </button>
  )
}

/** Browsers and proxies: every browser running now, then every proxy whose last test failed, and what the proxies cost a month. */
function BrowsersWidget({ data, reach, go }: { data: AntiDetectData; reach: ProjectReach | null; go: Go }) {
  const running = data.profiles.profiles.filter((profile) => profile.browser !== "stopped" && (!reach || reach.profiles.has(profile.id)))
  const proxies = data.proxies.filter((proxy) => !reach || reach.proxies.has(proxy.id))
  const failing = proxies.filter((proxy) => proxyTestOf(proxy) === "failed")
  const costed = proxies.filter((proxy) => proxy.monthlyCost !== null)
  const total = costed.reduce((sum, proxy) => sum + (proxy.monthlyCost ?? 0), 0)
  return (
    <Scroll>
      <Part>Running now</Part>
      {running.length ? (
        running.map((profile) => (
          <Row
            key={profile.id}
            title={profile.name}
            line={profile.proxy ? profile.proxy.label || profile.proxy.host : "This computer's own address"}
            value={browserWords(profile)}
            onPress={() => go("profiles", { open: profile.id })}
          />
        ))
      ) : (
        <Quiet>No browser is open.</Quiet>
      )}
      <Part>Proxies that failed their last test</Part>
      {failing.length ? (
        failing.map((proxy) => (
          <Row
            key={proxy.id}
            title={proxy.label || proxy.host}
            line={proxy.lastTestResult?.error || null}
            value={counted(proxy.usedBy.length, "profile")}
            onPress={() => go("proxies", { open: proxy.id })}
          />
        ))
      ) : (
        <Quiet>{proxies.length ? "Every proxy passed its last test, or has not been tested." : "No proxies yet."}</Quiet>
      )}
      {costed.length ? <Quiet>{proxyCostTotalText(total, costed.length)}</Quiet> : null}
    </Scroll>
  )
}

/** Racks: each rack with its phones online and the ones needing a look, a press showing its phones in Phones; one not checking in says so. */
function RacksWidget({ data, reach, go }: { data: AntiDetectData; reach: ProjectReach | null; go: Go }) {
  const counts = rackCounts(data.phones)
  const racks = data.phones.racks.filter((rack) => !reach || reach.racks.has(rack.id))
  const loose = data.phones.phones.filter((phone) => !phone.rackId && (!reach || reach.phones.has(phone.id)))
  if (!racks.length && !loose.length) return <Quiet>No racks yet. New rack in the Racks block&apos;s ⋮ makes one.</Quiet>
  return (
    <Scroll>
      {data.phones.pausedAt ? <Quiet>Every rack is paused.</Quiet> : null}
      {racks.map((rack) => {
        const count = counts.get(rack.id) ?? { total: 0, online: 0, warnings: 0 }
        return (
          <Row
            key={rack.id}
            title={rack.name}
            line={[rack.state === "live" ? null : rackStateWords(rack), count.warnings ? `${counted(count.warnings, "phone")} to look at` : null]
              .filter(Boolean)
              .join(" · ")}
            value={count.total ? `${count.online} of ${count.total} online` : "No phones"}
            onPress={() => go("phones", { rack: rack.id })}
          />
        )
      })}
      {loose.length ? (
        <Row title="No rack" line="Put each one on a rack" value={counted(loose.length, "phone")} onPress={() => go("phones", { rack: NO_GROUP })} />
      ) : null}
    </Scroll>
  )
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`

/**
 * Bans in 30 days: how many each app banned in the last 30 days, each
 * opening the Bans list filtered to it, then the sellers' bans and the
 * dollars lost (Bans task, part 16), each opening that seller's bans.
 */
function BansWidget({ page, projectId, go }: { page: BansPage; projectId: string; go: Go }) {
  // Counted from when Overview was opened, so the figures do not shift while it is read.
  const [openedAt] = React.useState(() => Date.now())
  const recent = page.bans.filter(
    (ban) => (!projectId || ban.project?.id === projectId) && new Date(ban.at).getTime() >= openedAt - 30 * DAY_MS
  )
  const byApp = new Map<string, number>()
  for (const ban of recent) byApp.set(ban.app, (byApp.get(ban.app) ?? 0) + 1)
  const projectSellers = projectId
    ? new Set(page.bans.filter((ban) => ban.project?.id === projectId).map((ban) => ban.seller.toLowerCase()))
    : null
  const sellers = page.sellers.filter((line) => !projectSellers || projectSellers.has(line.seller.toLowerCase()))
  return (
    <Scroll>
      {byApp.size ? (
        [...byApp]
          .sort((a, b) => b[1] - a[1])
          .map(([app, count]) => (
            <Row
              key={app}
              title={appName(app)}
              value={counted(count, "ban")}
              onPress={() => go("bans", { app: app as AntiDetectSearch["app"], since: 30 })}
            />
          ))
      ) : (
        <Quiet>No account was banned in the last 30 days.</Quiet>
      )}
      {sellers.length ? (
        <>
          <Part>Sellers</Part>
          {sellers.map((line) => (
            <Row
              key={line.seller}
              title={line.seller}
              line={`${counted(line.banned, "ban")} out of ${line.bought} bought, ${dollars(line.lostCents)} lost`}
              onPress={() => go("bans", { seller: line.seller })}
            />
          ))}
        </>
      ) : null}
    </Scroll>
  )
}

/**
 * Waiting on you: the apps the brake holds after two bans in a day, each
 * with its Release (Bans task, part 11; nothing restarts by itself), and
 * each screen Promo did not know, with its picture, the line, and It's a ban
 * or Not a ban (part 9). The account is stopped until it is answered.
 */
function WaitingWidget({ page, projectId, onChanged }: { page: BansPage; projectId: string; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = React.useState<string | null>(null)
  // A project picked shows its own accounts' screens; the brake is per app, so it always shows.
  const projectAccounts = projectId
    ? new Set(page.bans.filter((ban) => ban.project?.id === projectId).flatMap((ban) => (ban.account ? [ban.account.id] : [])))
    : null
  const screens = page.unknown.filter((screen) => !projectAccounts || (screen.account && projectAccounts.has(screen.account.id)))

  async function release(app: string) {
    setBusy(app)
    try {
      await releaseAppBrake(app)
      await onChanged()
    } catch (failure) {
      showErrorToast(getBansErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  if (!page.brakes.length && !screens.length) return <Quiet>Nothing is waiting on you.</Quiet>
  return (
    <Scroll>
      {page.brakes.map((brake) => (
        <div key={brake.app} className="flex flex-wrap items-center gap-2 px-1.5 py-1.5 text-sm">
          <span className="min-w-0 flex-1">
            Every {appName(brake.app)} account is paused since {formatDateTime(brake.at)}, after two bans in a day. Their jobs wait.
          </span>
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void release(brake.app)}>
            {busy === brake.app ? <Loader2Icon className="animate-spin" /> : null}
            Release {appName(brake.app)}
          </Button>
        </div>
      ))}
      {screens.map((screen) => (
        <UnknownScreen key={screen.id} screen={screen} onChanged={onChanged} />
      ))}
    </Scroll>
  )
}

/** A screen Promo did not know: its picture and the line, and It's a ban or Not a ban. */
function UnknownScreen({ screen, onChanged }: { screen: BansPage["unknown"][number]; onChanged: () => Promise<void> }) {
  const [picture, setPicture] = React.useState<string | null | undefined>(screen.hasPicture ? undefined : null)
  const [busy, setBusy] = React.useState<"ban" | "harmless" | null>(null)

  React.useEffect(() => {
    if (!screen.hasPicture) return
    let live = true
    loadUnknownScreenPicture(screen.id).then(
      (src) => live && setPicture(src),
      () => live && setPicture(null)
    )
    return () => {
      live = false
    }
  }, [screen.hasPicture, screen.id])

  async function answer(verdict: "ban" | "harmless") {
    setBusy(verdict)
    try {
      await answerUnknownScreen(screen.id, verdict)
      await onChanged()
    } catch (failure) {
      showErrorToast(getBansErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const name = screen.account ? handleWords(screen.account.platform, screen.account.handle) || "An account" : "An account"
  return (
    <div className="grid gap-2 border-t px-1.5 py-2.5 text-sm first:border-t-0">
      <p className="font-medium">{"Promo doesn't know this screen. Is it a ban?"}</p>
      <p>
        {name} on {appName(screen.app)}, {formatDateTime(screen.at)}: &ldquo;{screen.line}&rdquo;
      </p>
      {picture === undefined ? (
        <LoadingRow label="Opening the picture" />
      ) : picture ? (
        <img src={picture} alt={`What ${appName(screen.app)} showed`} className="max-h-48 w-fit max-w-full rounded-md border" />
      ) : null}
      <p className="text-muted-foreground">The account is stopped until you answer.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="destructive" disabled={busy !== null} onClick={() => void answer("ban")}>
          {busy === "ban" ? <Loader2Icon className="animate-spin" /> : null}
          {"It's a ban"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void answer("harmless")}>
          {busy === "harmless" ? <Loader2Icon className="animate-spin" /> : null}
          Not a ban
        </Button>
      </div>
    </div>
  )
}
