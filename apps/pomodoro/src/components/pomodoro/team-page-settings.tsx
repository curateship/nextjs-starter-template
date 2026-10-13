import * as React from "react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Switch } from "@/components/ui/switch"
import type { WindowQuestion } from "@/components/pomodoro/group-window-question"
import { PanelCard } from "@/components/pomodoro/panel-card"
import { TextLink } from "@/components/pomodoro/text-link"
import { loadTeamPage, saveTeamPage } from "@/lib/api/pomodoro/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { groupErrorMessage } from "@/lib/pomodoro/groups"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import {
  HANDLE_MAX_LENGTH,
  isHandleAvailableShape,
} from "@/lib/pomodoro/public-profile"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type Settings = Awaited<ReturnType<typeof loadTeamPage>>

/**
 * What each member sees about the page, owner included. The same words in
 * both cards so nobody is told a different rule.
 */
const WHAT_IT_SHOWS =
  "Each person appears only as their own public page already shows them: hours only if they show their hours there, and not by name at all without a public page. The owner sees the same page a stranger does."

/**
 * The owner's public page settings, the Public page section of Edit group
 * (Tyler, 13 Oct 2026): the page's address and its switch.
 *
 * Both save on their own, the switch the moment it moves and the address when
 * the box is left or Enter is pressed, the way Settings saves. A refused save
 * keeps what was typed and says why in the error toast. Changing the address
 * of a live page asks first, through `ask`, so the question takes the
 * window's place.
 */
export function TeamPageSettingsFields({
  groupId,
  onChanged,
  ask,
}: {
  groupId: string
  /** Refreshes the groups list, so members see the page's address. */
  onChanged: () => Promise<unknown>
  ask: (question: WindowQuestion) => void
}) {
  const [settings, setSettings] = React.useState<Settings | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [handle, setHandle] = React.useState("")
  const [run, busy] = useAsyncAction(groupErrorMessage)
  const inputId = React.useId()
  const switchId = React.useId()

  React.useEffect(() => {
    let cancelled = false
    void loadTeamPage(groupId)
      .then((loaded) => {
        if (cancelled) return
        setFailed(false)
        setSettings(loaded)
        setHandle(loaded.handle ?? "")
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [groupId, attempt])

  if (failed)
    return (
      <div className="grid gap-4">
        <ErrorRow
          message="The public page settings could not be loaded."
          onRetry={() => {
            dismissErrorToast()
            setFailed(false)
            setAttempt((count) => count + 1)
          }}
        />
      </div>
    )
  if (!settings)
    return (
      <div className="grid gap-4">
        <LoadingRow label="Loading the public page settings" />
      </div>
    )

  const typed = handle.trim().toLowerCase()
  const badHandle = typed.length > 0 && !isHandleAvailableShape(typed)

  const save = (next: { handle: string | null; pagePublic: boolean }) =>
    run(async () => {
      const saved = await saveTeamPage(groupId, next)
      setSettings(saved)
      setHandle(saved.handle ?? "")
      await onChanged()
    }, next.pagePublic === settings.pagePublic ? "Address saved." : next.pagePublic ? "The page is public." : "The page is off.")

  const saveHandle = () => {
    if ((settings.handle ?? "") === typed) return
    if (badHandle) {
      showErrorToast(groupErrorMessage(new Error("TEAM_HANDLE_SHAPE")))
      return
    }
    // Clearing the address of a public page takes the page down with it,
    // because a page with no address cannot answer.
    const next = {
      handle: typed || null,
      pagePublic: typed ? settings.pagePublic : false,
    }
    // A page that is live has a link out in the world, so changing its
    // address asks first. A page that is off has nothing to break.
    if (settings.pagePublic && settings.handle)
      ask({
        title: next.handle ? "Change the page address?" : "Turn the page off?",
        description: next.handle
          ? `The old link /team/${settings.handle} stops working for everybody you shared it with. The page moves to /team/${next.handle}.`
          : `A page with no address cannot be opened, so the page goes off and /team/${settings.handle} stops working.`,
        cancelLabel: "Keep the old address",
        confirmLabel: next.handle ? "Change address" : "Turn the page off",
        onConfirm: () => save(next),
        // Keep puts the live address back in the box.
        onCancel: () => setHandle(settings.handle ?? ""),
      })
    else void save(next)
  }

  // A Free owner with the page off is shown the perk, not two controls the
  // server would refuse.
  if (!settings.canPublish && !settings.pagePublic)
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {PRO_PERKS.teamPage.lockedReason}
        </p>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link to="/plans">See plans</Link>
        </Button>
      </div>
    )

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={inputId}
          hint="3 to 30 characters: lowercase letters, digits, hyphens and underscores."
        >
          Page address
        </FieldLabel>
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-sm text-muted-foreground">
            /team/
          </span>
          <Input
            id={inputId}
            value={handle}
            maxLength={HANDLE_MAX_LENGTH}
            aria-invalid={badHandle}
            placeholder="northfold"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => setHandle(event.target.value)}
            onBlur={saveHandle}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveHandle()
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          checked={settings.pagePublic}
          disabled={busy}
          onCheckedChange={(checked) => {
            // Switching on with nothing typed says why, rather than sending a
            // save the server would refuse.
            if (checked && !typed) {
              showErrorToast(groupErrorMessage(new Error("TEAM_HANDLE_NEEDED")))
              return
            }
            if (checked && badHandle) {
              showErrorToast(groupErrorMessage(new Error("TEAM_HANDLE_SHAPE")))
              return
            }
            void save({ handle: typed, pagePublic: checked })
          }}
        />
        <Label htmlFor={switchId} className="text-sm font-normal">
          Show this group on a public page
        </Label>
      </div>
      {settings.pagePublic && !settings.canPublish ? (
        <p role="status" className="text-sm text-muted-foreground">
          The page is hidden until you are on Pro again. Your address and
          switch are kept.
        </p>
      ) : null}
      {settings.pagePublic && settings.handle ? (
        <p className="text-sm">
          <TextLink to="/team/$handle" params={{ handle: settings.handle }}>
            Open the page
          </TextLink>
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{WHAT_IT_SHOWS}</p>
    </div>
  )
}

/** A member's panel: the group has a public page, and what that means for them. */
export function TeamPageNoticeCard({ teamHandle }: { teamHandle: string }) {
  return (
    <PageCard>
      <p className="text-sm">
        This group has a public page at{" "}
        <TextLink to="/team/$handle" params={{ handle: teamHandle }}>
          /team/{teamHandle}
        </TextLink>
        .
      </p>
      <p className="text-xs text-muted-foreground">{WHAT_IT_SHOWS}</p>
    </PageCard>
  )
}

function PageCard({ children }: { children: React.ReactNode }) {
  return <PanelCard label="Public page">{children}</PanelCard>
}
