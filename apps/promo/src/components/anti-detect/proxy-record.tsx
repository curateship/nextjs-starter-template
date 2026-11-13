import * as React from "react"
import { format } from "date-fns"
import { ActivityIcon, GlobeIcon, Loader2Icon, MonitorIcon, WalletIcon } from "lucide-react"

import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
import { ActionRow } from "@/components/crm/crm-record-menu"
import type { RowMenuItem } from "@/components/crm/crm-row"
import { FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DetailNote, DetailRow, DetailRows } from "@/components/dashboard-page/detail-rows"
import { TextPickRow } from "@/components/dashboard-page/text-pick-row"
import { PickDayRow, PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { getProxyErrorMessage, saveProxy, type ProxyView } from "@/lib/api/browser/proxies"
import { appName } from "@/lib/bans/options"
import { addressWords, PROXY_KIND_LABELS, renewalText } from "@/lib/browser/wording"
import { PROXY_KINDS, PROXY_PROTOCOLS, type ProxyKind, type ProxyProtocol } from "@/lib/social/options"
import { showErrorToast } from "@/lib/toast/error-toast"

type ProxyFields = Parameters<typeof saveProxy>[1]

const money = (dollars: number) => `$${dollars.toFixed(2)}`

/**
 * One proxy on the right of the Anti Detect dashboard's Proxies, drawn as
 * the shell's records are (Tyler, 12 Nov 2026: "the right panel is mostly
 * not using ui standards. Look at how shell does it").
 *
 * - **Header:** its name, kind, protocol and country, and its ⋮. The ⋮'s
 *   General tab holds its fields as grouped rows that each save themselves:
 *   name, kind, protocol, host, port, username and password, then what it
 *   costs a month and when it renews. The password row says "Stored" and
 *   only a typed password is sent, so the stored one never comes back out.
 *   Then Test it, and Delete in red.
 * - **Body:** grey `PanelCard`s of facts: How it is doing, Used by, What it
 *   costs.
 * - **Footer:** how many profiles use it, and Test now.
 */
export function ProxyRecord({
  proxy,
  testing,
  actions,
  onTest,
  onChanged,
}: {
  proxy: ProxyView
  testing: boolean
  actions: RowMenuItem[]
  onTest: () => void
  onChanged: () => Promise<void>
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Bumped after a password is saved, so its box empties again.
  const [passwordSaves, setPasswordSaves] = React.useState(0)
  const bannedOn = Object.keys(proxy.bannedOn).map(appName).sort()

  /** Saves one change, with the rest of the proxy as it is; the stored password stays unless one is typed. */
  async function saveField(patch: Partial<ProxyFields>): Promise<boolean> {
    try {
      await saveProxy(proxy.id, {
        label: proxy.label,
        kind: proxy.kind,
        protocol: proxy.protocol,
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        monthlyCost: proxy.monthlyCost,
        renewsOn: proxy.renewsOn,
        ...patch,
      })
      await onChanged()
      return true
    } catch (failure) {
      showErrorToast(getProxyErrorMessage(failure))
      return false
    }
  }

  const runAction = (action: RowMenuItem) => () => {
    setMenuOpen(false)
    action.onSelect()
  }

  return (
    <RecordFrame
      avatar={<GlobeIcon aria-hidden />}
      title={proxy.label || proxy.host}
      line={`${PROXY_KIND_LABELS[proxy.kind]} · ${proxy.protocol}${proxy.country ? ` · ${proxy.country}` : ""}`}
      hideLabel="Hide the proxy"
      actions={
        <TabbedMenu
          label="Proxy menu"
          align="end"
          width="20.4rem"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          tabs={[
            {
              value: "general",
              label: "General",
              content: (
                <div className="grid gap-3 p-3">
                  <PickGroup title="Proxy">
                    <TextPickRow id="proxy-label" label="Name" value={proxy.label} placeholder="US residential 3" onSave={(label) => saveField({ label })} />
                    <PickMenuRow
                      label="Kind"
                      value={PROXY_KIND_LABELS[proxy.kind]}
                      options={PROXY_KINDS.map((kind) => ({ value: kind, label: PROXY_KIND_LABELS[kind] }))}
                      selected={proxy.kind}
                      onPick={(kind) => void saveField({ kind: kind as ProxyKind })}
                    />
                    <PickMenuRow
                      label="Protocol"
                      value={proxy.protocol}
                      options={PROXY_PROTOCOLS.map((protocol) => ({ value: protocol, label: protocol }))}
                      selected={proxy.protocol}
                      onPick={(protocol) => void saveField({ protocol: protocol as ProxyProtocol })}
                    />
                  </PickGroup>
                  <PickGroup title="Where it is">
                    <TextPickRow id="proxy-host" label="Host" value={proxy.host} placeholder="gate.example.com" onSave={(host) => saveField({ host })} />
                    <TextPickRow
                      id="proxy-port"
                      label="Port"
                      value={String(proxy.port)}
                      inputMode="numeric"
                      onSave={(text) => {
                        const port = Number(text.trim())
                        if (!Number.isInteger(port) || port < 1 || port > 65_535) {
                          showErrorToast("A port is a whole number from 1 to 65535.")
                          return Promise.resolve(false)
                        }
                        return saveField({ port })
                      }}
                    />
                    <TextPickRow id="proxy-username" label="Username" value={proxy.username} onSave={(username) => saveField({ username })} />
                    <TextPickRow
                      key={passwordSaves}
                      id="proxy-password"
                      label="Password"
                      type="password"
                      value=""
                      shown={proxy.hasPassword ? "Stored" : ""}
                      placeholder={proxy.hasPassword ? "Stored. Type only to change it." : ""}
                      onSave={async (password) => {
                        const saved = await saveField({ password })
                        if (saved) setPasswordSaves((count) => count + 1)
                        return saved
                      }}
                    />
                  </PickGroup>
                  <PickGroup title="What it costs">
                    <TextPickRow
                      id="proxy-cost"
                      label="A month"
                      value={proxy.monthlyCost === null ? "" : proxy.monthlyCost.toFixed(2)}
                      shown={proxy.monthlyCost === null ? "" : money(proxy.monthlyCost)}
                      inputMode="decimal"
                      placeholder="12.00"
                      onSave={(text) => {
                        const typed = text.replace(/[$,\s]/g, "")
                        const cost = typed ? Number(typed) : null
                        if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 100_000)) {
                          showErrorToast("A proxy's monthly cost has to be an amount from 0 to 100000.")
                          return Promise.resolve(false)
                        }
                        return saveField({ monthlyCost: cost })
                      }}
                    />
                    <PickDayRow
                      label="Renews on"
                      value={proxy.renewsOn ? format(new Date(`${proxy.renewsOn}T00:00:00`), "MMM d, yyyy") : "Not set"}
                      empty={!proxy.renewsOn}
                      day={proxy.renewsOn ? new Date(`${proxy.renewsOn}T00:00:00`) : null}
                      onPick={(day) => void saveField({ renewsOn: day ? format(day, "yyyy-MM-dd") : null })}
                    />
                  </PickGroup>
                  <div>
                    {actions
                      .filter((action) => !action.destructive)
                      .map((action) => (
                        <ActionRow key={action.label} icon={action.icon} onClick={runAction(action)}>
                          {action.label}
                        </ActionRow>
                      ))}
                    <div aria-hidden className="-mx-3 my-1.5 border-t" />
                    {actions
                      .filter((action) => action.destructive)
                      .map((action) => (
                        <ActionRow key={action.label} destructive icon={action.icon} onClick={runAction(action)}>
                          {action.label}
                        </ActionRow>
                      ))}
                  </div>
                </div>
              ),
            },
          ]}
        />
      }
      body={
        <>
          <PanelCard icon={<ActivityIcon />} storageId="promo-proxy-health" title="How it is doing">
            <DetailRows>
              <DetailRow label="Last test" value={<ProxyTestBadge result={proxy.lastTestResult} compact />} />
              <DetailRow label="Endpoint" value={`${proxy.host}:${proxy.port}`} />
              <DetailRow label="Country" value={proxy.lastTestResult?.country || proxy.country || "Not known yet"} />
              <DetailRow label="Outside address" value={addressWords(proxy.addresses)} />
            </DetailRows>
            {/* A proxy in a counted ban is refused for that app (Bans task, part 13). */}
            {bannedOn.length ? <p className="text-sm text-destructive">Banned on {bannedOn.join(", ")}.</p> : null}
          </PanelCard>
          <PanelCard icon={<MonitorIcon />} storageId="promo-proxy-used-by" title="Used by" meta={proxy.usedBy.length}>
            {proxy.usedBy.length ? (
              <ul className="grid gap-2">
                {proxy.usedBy.map((user) => (
                  <li key={user.id} className="truncate text-sm font-medium">
                    {user.name}
                  </li>
                ))}
              </ul>
            ) : (
              <DetailNote>No browser profile uses it yet.</DetailNote>
            )}
          </PanelCard>
          <PanelCard
            icon={<WalletIcon />}
            storageId="promo-proxy-cost"
            title="What it costs"
            meta={proxy.monthlyCost === null ? undefined : `${money(proxy.monthlyCost)} a month`}
          >
            <DetailRows>
              <DetailRow label="A month" value={proxy.monthlyCost === null ? "Not said" : money(proxy.monthlyCost)} />
              <DetailRow label="Renews" value={proxy.renewsOn ? renewalText(proxy.renewsOn) : "Not set"} />
            </DetailRows>
            <DetailNote>The bell rings three days before it renews.</DetailNote>
          </PanelCard>
        </>
      }
      footer={
        <>
          <FooterState>
            <span className="text-muted-foreground">
              {proxy.usedBy.length ? `${proxy.usedBy.length} ${proxy.usedBy.length === 1 ? "profile" : "profiles"}` : "Not in use"}
            </span>
          </FooterState>
          <Button type="button" disabled={testing} onClick={onTest}>
            {testing ? <Loader2Icon className="animate-spin" /> : <ActivityIcon />}
            Test now
          </Button>
        </>
      }
    />
  )
}
