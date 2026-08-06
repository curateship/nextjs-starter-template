import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { DataCleanupCard } from "@/components/settings/data-cleanup-card"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  SESSION_IDLE_MINUTE_OPTIONS,
  SESSION_MAX_AGE_DAY_OPTIONS,
  type ShellConfig,
  type ShellSessionPolicy,
} from "@/lib/custom-shell"
import { plural } from "@/lib/format/plural"

/**
 * Settings → Security. The session policy saves through its own confirmed
 * write (see server/auth/session-policy.ts), not the page's auto-save: making a
 * limit stricter signs people out, so it asks first. Loosening a limit signs
 * nobody out and saves straight away.
 */
export function SecuritySettings({
  config,
  onSessionPolicyChange,
  sessionPolicyBusy,
}: {
  config: ShellConfig
  onSessionPolicyChange: (policy: ShellSessionPolicy) => Promise<boolean>
  sessionPolicyBusy: boolean
}) {
  const policy = config.sessionPolicy
  // A stricter policy waits here for the confirm dialog; null means no ask.
  const [pending, setPending] = React.useState<ShellSessionPolicy | null>(null)

  const requestChange = (next: ShellSessionPolicy) => {
    if (
      tightens(policy.maxAgeDays, next.maxAgeDays) ||
      tightens(policy.idleMinutes, next.idleMinutes)
    ) {
      setPending(next)
      return
    }
    void onSessionPolicyChange(next)
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="session-policy"
        title="Sessions"
        description="How long a sign-in lasts before people have to sign in again. Applies to everyone, admins included."
        contentClassName="space-y-6"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="session-max-age"
            hint="The longest anyone can stay signed in on one browser, however active they are. When their time is up they just sign in again."
          >
            Sign-ins expire
          </FieldLabel>
          <Select
            value={String(policy.maxAgeDays)}
            disabled={sessionPolicyBusy}
            onValueChange={(value) =>
              requestChange({ ...policy, maxAgeDays: Number(value) })
            }
          >
            <SelectTrigger id="session-max-age" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SESSION_MAX_AGE_DAY_OPTIONS.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {maxAgeLabel(days)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="session-idle"
            hint="How long someone can be away before they are signed out. Using the app — opening pages, clicking around — counts as being here."
          >
            Sign out inactive people
          </FieldLabel>
          <Select
            value={String(policy.idleMinutes)}
            disabled={sessionPolicyBusy}
            onValueChange={(value) =>
              requestChange({ ...policy, idleMinutes: Number(value) })
            }
          >
            <SelectTrigger id="session-idle" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SESSION_IDLE_MINUTE_OPTIONS.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {idleLabel(minutes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CollapsibleSettingsCard>

      <DataCleanupCard />

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title="Tighten session limits?"
        description="Anyone already past the new limit is signed out the moment you confirm — including you, if your own sign-in is past it. Everyone else stays signed in and is signed out when they reach it."
        confirmLabel="Apply session limits"
        loading={sessionPolicyBusy}
        onConfirm={() => {
          if (!pending) return
          void onSessionPolicyChange(pending).then((saved) => {
            if (saved) setPending(null)
          })
        }}
      />
    </CardGroup>
  )
}

/** Stricter means a limit switches on, or an existing one gets shorter. */
function tightens(current: number, next: number) {
  return next !== 0 && (current === 0 || next < current)
}

function maxAgeLabel(days: number) {
  if (days === 0) return "Never — people stay signed in"
  if (days === 365) return "After 1 year"
  return `After ${days} ${plural(days, "day", "days")}`
}

function idleLabel(minutes: number) {
  if (minutes === 0) return "Never"
  if (minutes < 60) return `After ${minutes} minutes away`
  if (minutes < 1440) {
    const hours = minutes / 60
    return `After ${hours} ${plural(hours, "hour away", "hours away")}`
  }
  const days = minutes / 1440
  return `After ${days} ${plural(days, "day away", "days away")}`
}
