import * as React from "react"
import { Loader2Icon, MonitorIcon, RotateCwIcon, UsersIcon } from "lucide-react"

import { ProfileBackupsPanel } from "@/components/browser/profile-backups-panel"
import { ProfileHistory } from "@/components/browser/profile-dialog"
import { ProfileIdentityPanel } from "@/components/browser/profile-identity-panel"
import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
import { ActionRow } from "@/components/crm/crm-record-menu"
import type { RowMenuItem } from "@/components/crm/crm-row"
import { FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DetailNote, DetailRow, DetailRows } from "@/components/dashboard-page/detail-rows"
import { TextPickRow } from "@/components/dashboard-page/text-pick-row"
import { PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { browserWords } from "@/lib/anti-detect/rows"
import { getProfileErrorMessage, saveProfile, type ProfileRow, type ProfilesPage } from "@/lib/api/browser/profiles"
import { signedInWords } from "@/lib/browser/wording"
import { formatTimeAgo } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The value a pick uses for "none", since a choice cannot be empty. */
const NONE = "none"

type ProfileFields = Parameters<typeof saveProfile>[1]

/**
 * One browser profile on the right of the Anti Detect dashboard's Profiles,
 * drawn as the shell's records are (Tyler, 12 Nov 2026: "the right panel is
 * mostly not using ui standards. Look at how shell does it").
 *
 * - **Header:** its name, the browser's state, and its ⋮. The ⋮'s General
 *   tab holds what can be changed, as grouped rows that each save themselves:
 *   Name and Notes, the proxy it goes out through, and its folder, label and
 *   tags. Then Open or Show, Stop, Duplicate, and Delete in red.
 * - **Body:** grey `PanelCard`s of facts: Browser (its proxy, last test and
 *   country, Restart for a browser on its old proxy), Signed in, This
 *   profile's machine, What a site sees, Backups and History.
 * - **Footer:** how many are signed in, and Open browser, or Show browser
 *   while it runs.
 */
export function ProfileRecord({
  profile,
  page,
  actions,
  onOpenBrowser,
  onRestart,
  onChanged,
}: {
  profile: ProfileRow
  page: ProfilesPage
  actions: RowMenuItem[]
  /** Opens the browser, or shows it while it runs. */
  onOpenBrowser: () => void
  onRestart: (profile: ProfileRow) => Promise<void>
  /** The profile changed: a field saved, a check, a new identity, a backup. */
  onChanged: () => Promise<void>
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [restarting, setRestarting] = React.useState(false)
  const running = profile.browser !== "stopped"
  const proxy = page.proxies.find((one) => one.id === profile.proxy?.id) ?? null
  const proxyName = profile.proxy ? profile.proxy.label || profile.proxy.host : "This computer's own address"
  const proxyCountry = proxy?.lastTestResult?.country || proxy?.country || ""
  // A proxy in another country moves every signed-in account with it: said, never refused.
  const jump =
    profile.lastCountry && proxyCountry && profile.lastCountry !== proxyCountry
      ? `This profile last went out from ${profile.lastCountry}. Its proxy goes out from ${proxyCountry}, so the sites it is signed in to see the accounts jump countries.`
      : null

  /** Saves one change, with the rest of the profile as it is. */
  async function saveField(patch: Partial<ProfileFields>): Promise<boolean> {
    try {
      await saveProfile(profile.id, {
        name: profile.name,
        proxyId: profile.proxy?.id ?? null,
        notes: profile.notes,
        folderId: profile.folderId,
        labelId: profile.labelId,
        tags: profile.tags,
        ...patch,
      })
      await onChanged()
      return true
    } catch (failure) {
      showErrorToast(getProfileErrorMessage(failure))
      return false
    }
  }

  const runAction = (action: RowMenuItem) => () => {
    setMenuOpen(false)
    action.onSelect()
  }
  const folder = page.folders.find((one) => one.id === profile.folderId)
  const label = page.labels.find((one) => one.id === profile.labelId)

  return (
    <RecordFrame
      avatar={<MonitorIcon aria-hidden />}
      title={profile.name}
      line={browserWords(profile)}
      hideLabel="Hide the profile"
      actions={
        <TabbedMenu
          label="Profile menu"
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
                  <PickGroup title="Profile">
                    <TextPickRow id="profile-name" label="Name" value={profile.name} placeholder="Main" onSave={(name) => saveField({ name })} />
                    <TextPickRow id="profile-notes" label="Notes" value={profile.notes} multiline onSave={(notes) => saveField({ notes })} />
                  </PickGroup>
                  <PickGroup title="Goes out through">
                    <PickMenuRow
                      label="Proxy"
                      value={proxyName}
                      options={[
                        { value: NONE, label: "This computer's own address" },
                        ...page.proxies.map((one) => ({ value: one.id, label: one.label || one.host })),
                      ]}
                      selected={profile.proxy?.id ?? NONE}
                      onPick={(value) => void saveField({ proxyId: value === NONE ? null : value })}
                    />
                  </PickGroup>
                  <PickGroup title="Sorting">
                    <PickMenuRow
                      label="Folder"
                      value={folder?.name ?? "None"}
                      empty={!folder}
                      options={[{ value: NONE, label: "No folder" }, ...page.folders.map((one) => ({ value: one.id, label: one.name }))]}
                      selected={profile.folderId ?? NONE}
                      onPick={(value) => void saveField({ folderId: value === NONE ? null : value })}
                    />
                    <PickMenuRow
                      label="Label"
                      value={label?.name ?? "None"}
                      empty={!label}
                      options={[{ value: NONE, label: "No label" }, ...page.labels.map((one) => ({ value: one.id, label: one.name }))]}
                      selected={profile.labelId ?? NONE}
                      onPick={(value) => void saveField({ labelId: value === NONE ? null : value })}
                    />
                    <TextPickRow
                      id="profile-tags"
                      label="Tags"
                      value={profile.tags.join(", ")}
                      placeholder="warm, us-east"
                      onSave={(tags) => saveField({ tags: tags.split(",") })}
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
          <PanelCard icon={<MonitorIcon />} storageId="promo-profile-browser" title="Browser" meta={browserWords(profile)}>
            <DetailRows>
              <DetailRow label="Proxy" value={proxyName} />
              <DetailRow label="Last test" value={profile.proxy ? <ProxyTestBadge result={profile.proxy.lastTestResult} compact /> : "None"} />
              <DetailRow label="Last went out from" value={profile.lastCountry || "Not yet"} />
              <DetailRow label="Last ran" value={profile.lastRanAt ? formatTimeAgo(profile.lastRanAt) : "Never"} />
            </DetailRows>
            {jump ? <p className="text-sm text-destructive">{jump}</p> : null}
            {profile.onOldProxy ? (
              <>
                <DetailNote>The open browser is still on the proxy it opened with. It changes when the browser restarts.</DetailNote>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start bg-background"
                  disabled={restarting}
                  onClick={async () => {
                    setRestarting(true)
                    try {
                      await onRestart(profile)
                    } finally {
                      setRestarting(false)
                    }
                  }}
                >
                  {restarting ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
                  Restart it now
                </Button>
              </>
            ) : null}
          </PanelCard>
          <PanelCard icon={<UsersIcon />} storageId="promo-profile-signed-in" title="Signed in" meta={profile.accounts.length}>
            {profile.accounts.length ? (
              <ul className="grid gap-2">
                {profile.accounts.map((account) => (
                  <li key={account.id} className="truncate text-sm font-medium">
                    {signedInWords(account)}
                  </li>
                ))}
              </ul>
            ) : (
              <DetailNote>Nobody is signed in inside it. An account picks this profile when it is added.</DetailNote>
            )}
          </PanelCard>
          <ProfileIdentityPanel profile={profile} onChanged={onChanged} />
          <ProfileBackupsPanel profile={profile} onChanged={onChanged} />
          <ProfileHistory profileId={profile.id} />
        </>
      }
      footer={
        <>
          <FooterState>
            <span className="text-muted-foreground">
              {profile.accounts.length ? `${profile.accounts.length} signed in` : "Nobody signed in"}
            </span>
          </FooterState>
          <Button type="button" disabled={profile.closing} onClick={onOpenBrowser}>
            {profile.browser === "opening" || profile.closing ? <Loader2Icon className="animate-spin" /> : <MonitorIcon />}
            {running ? "Show browser" : "Open browser"}
          </Button>
        </>
      }
    />
  )
}
