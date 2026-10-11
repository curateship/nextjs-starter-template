import * as React from "react"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useRememberedChoice } from "@/lib/remembered-choice"

/**
 * "Real members only" on the admin's Focus and Leaderboard pages (live
 * activity task 05, Part 6): leaves every made-up member out of the rows and
 * the totals. Remembered in this browser, so it is still on after a reload.
 * See "Your controls" in `workspace/docs/made-up-members.md`.
 */

const STORAGE_KEY = "pomodoro-admin-real-only"
const CHOICES = ["all", "real"] as const

export function useRealOnly() {
  const [choice, setChoice] = useRememberedChoice(STORAGE_KEY, "all", CHOICES)
  return {
    realOnly: choice === "real",
    setRealOnly: (on: boolean) => setChoice(on ? "real" : "all"),
  }
}

export function RealOnlySwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const id = React.useId()
  return (
    <div className="flex h-8 shrink-0 items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="text-sm font-normal whitespace-nowrap">
        Real members only
      </Label>
    </div>
  )
}
