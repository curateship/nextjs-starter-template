import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  HandHelpingIcon,
  KeyRoundIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  UserRoundIcon,
} from "lucide-react"

import { ActionRow } from "@/components/crm/crm-record-menu"
import { FooterState, RecordFrame } from "@/components/crm/record-frame"
import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
import { PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { AccountHistoryPanel } from "@/components/social/accounts/account-history-panel"
import { AccountSourceCard } from "@/components/social/accounts/account-source"
import { AccountStatusBadge } from "@/components/social/accounts/account-status-badge"
import { AccountStatusLines } from "@/components/social/accounts/account-status-lines"
import { AppProfileCard } from "@/components/social/accounts/app-profile-card"
import { BanCard } from "@/components/social/accounts/ban-card"
import { ImportanceCard } from "@/components/social/accounts/importance-card"
import { LinkedinAccountCard } from "@/components/social/accounts/linkedin-account-card"
import { TwoFactorCard } from "@/components/social/accounts/two-factor-card"
import { XAccountCard } from "@/components/social/accounts/x-account-card"
import { MediumSignInButton } from "@/components/social/medium/medium-sign-in-button"
import { Button } from "@/components/ui/button"
import { putAccountInProject, takeAccountOutOfProject } from "@/lib/api/social/projects"
import {
  checkRedditAccounts,
  getRedditAccountsErrorMessage,
  letRedditAccountRunAgain,
  pauseRedditAccounts,
  setRedditAccountRunsOn,
  setRedditAccountsStatus,
  setRedditAccountVoice,
  type RedditAccountRow,
  type RedditAccountsPage,
} from "@/lib/api/social/reddit-accounts"
import { actOnXAccount, getXErrorMessage } from "@/lib/api/social/x"
import { formatTimeAgo } from "@/lib/format/format-time"
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, type AccountStatus } from "@/lib/social/account-status"
import { handleWords, isNetwork, isPhoneAppNetwork, NETWORK_NAMES } from "@/lib/social/networks"
import { countWords } from "@/lib/social/phone-apps"
import { readRunsOn, runsOnValue } from "@/lib/social/runs-on"
import { accountAgeText, postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

const NO_PROJECT = "none"
const NO_VOICE = "none"
const APP_DECIDES = "app"

/** "u/name", or the words for an account not signed in. */
export function accountName(row: RedditAccountRow) {
  return row.handle ? handleWords(row.platform, row.handle) : "Not signed in"
}

function platformName(platform: string) {
  return isNetwork(platform) ? NETWORK_NAMES[platform] : platform
}

/** How old it is, or how many posts it has where age is not read. */
function ageLine(row: RedditAccountRow) {
  switch (row.platform) {
    case "reddit":
      return row.redditCreatedAt ? accountAgeText(new Date(row.redditCreatedAt)) : "Not read yet"
    case "medium":
      return row.mediumJoinedAt ? `${accountAgeText(new Date(row.mediumJoinedAt))} on Medium` : "Not read yet"
    case "x":
      return row.x.joinedAt ? `${accountAgeText(new Date(row.x.joinedAt))} on X` : "Not read yet"
    case "linkedin":
      return row.signedInAt ? `First seen signed in ${formatTimeAgo(row.signedInAt)}` : "Not seen signed in yet"
    default:
      return row.postCount === null ? "Posts not read yet" : `${countWords(row.postCount)} posts`
  }
}

/**
 * One account on the Projects dashboard's right panel (Tyler, 12 Nov 2026),
 * in place of its old settings window.
 *
 * - **Header:** its name and platform, the line its status says, Medium's
 *   sign-in key, and the ⋮.
 * - **The ⋮:** General is Project, Voice, Runs on and Status as rows that
 *   save on a pick; then Check now, Send sign-in code, Help-only posts,
 *   Pause or Resume, and Retire or Bring back in red.
 * - **Body:** its status with every line it adds, what was last read of it,
 *   then the cards the window held, kept as they were: a ban, its app
 *   profile, X's and LinkedIn's own, important or throwaway, its two-factor
 *   code and where it came from. Its history is last.
 * - **Footer:** its status, and Check now.
 */
export function AccountRecord({
  row,
  page,
  projects,
  onChanged,
  onHelp,
  onRetire,
  onBringBack,
}: {
  row: RedditAccountRow
  page: RedditAccountsPage
  projects: { id: string; name: string }[]
  /** Something changed: the list reads again. */
  onChanged: () => Promise<void>
  onHelp: () => void
  onRetire: () => void
  onBringBack: () => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const name = accountName(row)
  const retired = Boolean(row.retiredAt)
  const network = isNetwork(row.platform) ? row.platform : null
  const appNetwork = isPhoneAppNetwork(row.platform) ? row.platform : null
  const reddit = row.platform === "reddit"

  async function act(work: () => Promise<unknown>, describe = getRedditAccountsErrorMessage) {
    setBusy(true)
    try {
      await work()
      await onChanged()
    } catch (error) {
      showErrorToast(describe(error))
    } finally {
      setBusy(false)
    }
  }
  const close = (work: () => void) => () => {
    setMenuOpen(false)
    work()
  }

  // The account's own profile or phone is not on the free lists, because it
  // holds this account, so it goes back on first.
  const profiles = network ? page.freeProfiles[network] : []
  const phones = network ? page.freePhones[network] : []
  const allProfiles = row.importance === "important" || appNetwork ? [] : row.profile ? [row.profile, ...profiles] : profiles
  const allPhones = row.phone ? [{ ...row.phone, note: "" }, ...phones] : phones
  const runsOn = runsOnValue({ profileId: row.profile?.id ?? null, phoneId: row.phone?.id ?? null })
  const runsOnName = row.profile?.name ?? (row.phone ? `Phone: ${row.phone.name}` : "Nowhere")
  const statusPick = row.status.byHand && row.status.status ? row.status.status : APP_DECIDES

  const general = (
    <div className="grid gap-3 p-3">
      <PickGroup title="Account">
        <PickMenuRow
          label="Project"
          value={row.project?.name ?? "None"}
          empty={!row.project}
          disabled={busy || retired}
          selected={row.project?.id ?? NO_PROJECT}
          options={[{ value: NO_PROJECT, label: "No project" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
          onPick={(value) =>
            void act(() => (value === NO_PROJECT ? takeAccountOutOfProject(row.id) : putAccountInProject(value, row.id)))
          }
        />
        <PickMenuRow
          label="Voice"
          value={row.voice?.name ?? "None"}
          empty={!row.voice}
          disabled={busy || retired}
          selected={row.voice?.id ?? NO_VOICE}
          options={[{ value: NO_VOICE, label: "No voice" }, ...page.voices.map((voice) => ({ value: voice.id, label: voice.name }))]}
          onPick={(value) => void act(() => setRedditAccountVoice(row.id, value === NO_VOICE ? null : value))}
        />
        <PickMenuRow
          label="Runs on"
          value={runsOnName}
          empty={!row.profile && !row.phone}
          disabled={busy || retired}
          selected={runsOn}
          options={[
            ...allProfiles.map((profile) => ({ value: `profile:${profile.id}`, label: profile.name })),
            ...allPhones.map((phone) => ({
              value: `phone:${phone.id}`,
              label: `Phone: ${phone.name}${phone.note ? ` (${phone.note})` : ""}`,
            })),
          ]}
          onPick={(value) => {
            if (value !== runsOn) void act(() => setRedditAccountRunsOn(row.id, readRunsOn(value)))
          }}
        />
        <PickMenuRow
          label="Status"
          value={row.status.byHand && row.status.status ? ACCOUNT_STATUS_LABELS[row.status.status] : "Let the app decide"}
          disabled={busy || retired}
          selected={statusPick}
          options={[
            { value: APP_DECIDES, label: "Let the app decide" },
            // At risk is worked out on each read from its signs, so it is never set by hand.
            ...ACCOUNT_STATUSES.filter((status) => status !== "at_risk").map((status) => ({
              value: status,
              label: ACCOUNT_STATUS_LABELS[status],
            })),
          ]}
          onPick={(value) =>
            void act(() => setRedditAccountsStatus([row.id], value === APP_DECIDES ? null : (value as AccountStatus)))
          }
        />
      </PickGroup>
      <p className="px-0.5 text-xs text-muted-foreground">
        Sign-ins do not move with it, so after a move sign in to {platformName(row.platform)} again in the new place. A
        phone it leaves needs wiping before another account goes on.
      </p>
      <div className="grid">
        {retired ? null : (
          <>
            <ActionRow icon={<RefreshCwIcon className="size-4" />} disabled={busy} onClick={close(() => void act(() => checkRedditAccounts([row.id])))}>
              Check now
            </ActionRow>
            {row.platform === "x" && row.profile && row.twoFactor ? (
              <ActionRow
                icon={<KeyRoundIcon className="size-4" />}
                disabled={busy}
                onClick={close(() => void act(() => actOnXAccount(row.id, "code"), getXErrorMessage))}
              >
                Send X&apos;s sign-in code
              </ActionRow>
            ) : null}
            {reddit ? (
              <ActionRow icon={<HandHelpingIcon className="size-4" />} onClick={close(onHelp)}>
                Help-only posts
              </ActionRow>
            ) : null}
            <ActionRow
              icon={row.paused === "account" ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
              disabled={busy}
              onClick={close(() => void act(() => pauseRedditAccounts([row.id], row.paused !== "account")))}
            >
              {row.paused === "account" ? "Resume" : "Pause"}
            </ActionRow>
          </>
        )}
        <div aria-hidden className="-mx-3 my-1.5 border-t" />
        {retired ? (
          <ActionRow icon={<ArchiveRestoreIcon className="size-4" />} disabled={busy} onClick={close(onBringBack)}>
            Bring back
          </ActionRow>
        ) : (
          <ActionRow destructive icon={<ArchiveIcon className="size-4" />} disabled={busy} onClick={close(onRetire)}>
            Retire
          </ActionRow>
        )}
      </div>
    </div>
  )

  const karma = reddit
    ? row.karma === null
      ? "Not read yet"
      : `${row.karma} karma`
    : row.followers === null
      ? "Not read yet"
      : `${countWords(row.followers)} followers`
  const lastWord = reddit ? "Last comment" : row.platform === "medium" ? "Last response or article" : "Last post"

  return (
    <RecordFrame
      avatar={<UserRoundIcon aria-hidden />}
      title={`${name} · ${platformName(row.platform)}`}
      line={retired ? `Retired ${formatTimeAgo(row.retiredAt!)} · ${row.retiredReason.words}` : row.project?.name ?? "No project"}
      hideLabel="Hide the account"
      actions={
        <>
          {row.platform === "medium" && row.profile && !retired ? <MediumSignInButton accountId={row.id} name={name} /> : null}
          <TabbedMenu
            label="Account menu"
            align="end"
            width="20.4rem"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            tabs={[{ value: "general", label: "General", content: general }]}
          />
        </>
      }
      body={
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-3.75">
          <section className="grid gap-2" aria-label="Status">
            <AccountStatusBadge view={row.status} />
            <AccountStatusLines row={row} />
          </section>
          <PickGroup title="Last read">
            <Fact label={reddit ? "Age" : "On the network"} value={ageLine(row)} />
            <Fact label={reddit ? "Karma" : "Followers"} value={karma} />
            <Fact label={lastWord} value={row.lastPostedAt ? postedDateText(new Date(row.lastPostedAt)) : "Never"} />
            <Fact
              label="Runs on"
              value={
                row.profile ? (
                  <Link to="/admin/profiles" search={{ open: row.profile.id }} className="hover:underline">
                    {row.profile.name}
                  </Link>
                ) : row.phone ? (
                  <Link to="/admin/phones" search={{ open: row.phone.id }} className="hover:underline">
                    Phone: {row.phone.name}
                  </Link>
                ) : (
                  <span className="text-destructive">Nowhere</span>
                )
              }
            />
            <Fact
              label="Goes online through"
              value={
                !row.profile && !row.phone ? (
                  "None"
                ) : row.phone?.connection === "sim" ? (
                  row.phone.simCarrier || "Its own SIM"
                ) : row.proxy ? (
                  <span className="flex items-center gap-2">
                    <span className="truncate">{row.proxy.label || "A proxy with no name"}</span>
                    <ProxyTestBadge result={row.proxy.lastTestResult} compact />
                  </span>
                ) : row.phone ? (
                  "House Wi-Fi"
                ) : (
                  "No proxy"
                )
              }
            />
          </PickGroup>
          {row.banScreen ? (
            <BanCard
              ban={
                row.ban
                  ? { ...row.ban, words: row.banScreen.words }
                  : // Stopped before bans were recorded: the screen's words, with no record behind them.
                    { id: "", kind: "suspended", at: row.banScreen.at, words: row.banScreen.words, hasPicture: false, appealedAt: null, appealNote: "", appealAnswer: "" }
              }
              accountName={name}
              stopped
              cleanUpHeldBack={row.ban?.cleanUpHeldBack ?? ""}
              phoneId={row.phone?.id ?? null}
              accountId={row.id}
              onRunAgain={() => act(() => letRedditAccountRunAgain(row.id))}
              onChanged={onChanged}
              onCleanedUp={onChanged}
            />
          ) : null}
          {appNetwork ? <AppProfileCard accountId={row.id} network={appNetwork} /> : null}
          {row.platform === "x" ? <XAccountCard account={row} onChanged={onChanged} /> : null}
          {row.platform === "linkedin" ? <LinkedinAccountCard account={row} onChanged={onChanged} /> : null}
          <ImportanceCard account={row} phones={phones} onChanged={onChanged} />
          <TwoFactorCard accountId={row.id} saved={row.twoFactor} onChanged={onChanged} />
          <AccountSourceCard accountId={row.id} initial={row.source} onSaved={onChanged} />
          <section className="grid gap-2" aria-label="History">
            <h3 className="px-0.5 text-sm font-medium text-muted-foreground">History</h3>
            <AccountHistoryPanel accountId={row.id} />
          </section>
        </div>
      }
      footer={
        <>
          <FooterState>
            <AccountStatusBadge view={row.status} />
          </FooterState>
          {retired ? (
            <Button type="button" variant="outline" disabled={busy} onClick={onBringBack}>
              <ArchiveRestoreIcon />
              Bring back
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void act(() => checkRedditAccounts([row.id]))}>
              {busy ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Check now
            </Button>
          )}
        </>
      }
    />
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className="max-w-[65%] min-w-0 truncate text-right">{value}</span>
    </div>
  )
}
