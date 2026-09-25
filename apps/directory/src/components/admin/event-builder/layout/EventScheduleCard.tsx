"use client"

import { useState } from "react"
import { format } from "date-fns"
import Repeat from "lucide-react/dist/esm/icons/repeat.js"
import ChevronDownIcon from "lucide-react/dist/esm/icons/chevron-down.js"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { describeRecurrence, weekdayOf, type RecurrenceRule } from "@/lib/utils/event-recurrence"

const WEEKDAYS = [
  { value: 0, short: "S", label: "Sunday" },
  { value: 1, short: "M", label: "Monday" },
  { value: 2, short: "T", label: "Tuesday" },
  { value: 3, short: "W", label: "Wednesday" },
  { value: 4, short: "T", label: "Thursday" },
  { value: 5, short: "F", label: "Friday" },
  { value: 6, short: "S", label: "Saturday" },
]

const ORDINALS = [
  { value: "1", label: "First" },
  { value: "2", label: "Second" },
  { value: "3", label: "Third" },
  { value: "4", label: "Fourth" },
  { value: "-1", label: "Last" },
]

type Mode = "none" | "weekly" | "monthly"

function occurrenceInMonth(dateStr: string): { week: number; weekday: number } | null {
  const weekday = weekdayOf(dateStr)
  if (weekday === null) return null
  const day = Number(dateStr.slice(8, 10))
  const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : day <= 28 ? 4 : -1
  return { week, weekday }
}

// Local (not UTC) date <-> string, matching the block editor's date picker so the
// day the user clicks is the day that gets stored.
function parseLocalDate(value: string): Date | undefined {
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}
function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

interface EventScheduleCardProps {
  date: string
  time: string
  rule: RecurrenceRule | null
  onDateChange: (date: string) => void
  onTimeChange: (time: string) => void
  onRuleChange: (rule: RecurrenceRule | null) => void
  /** True when editing a single generated occurrence (it can't define its own repeat). */
  isOccurrence?: boolean
  disabled?: boolean
}

export function EventScheduleCard({
  date,
  time,
  rule,
  onDateChange,
  onTimeChange,
  onRuleChange,
  isOccurrence,
  disabled,
}: EventScheduleCardProps) {
  const [dateOpen, setDateOpen] = useState(false)
  const selectedDate = date ? parseLocalDate(date) : undefined
  const untilDate = rule?.until ? parseLocalDate(rule.until) : undefined
  const anchorWeekday = date ? weekdayOf(date) : null
  const mode: Mode = rule?.freq ?? "none"

  function changeMode(next: Mode) {
    if (next === "none") return onRuleChange(null)
    const until = rule?.until ?? null
    if (next === "weekly") {
      onRuleChange({ freq: "weekly", weekdays: [anchorWeekday ?? 2], until })
    } else {
      const occ = date ? occurrenceInMonth(date) : null
      onRuleChange({ freq: "monthly", week: occ?.week ?? 1, weekday: occ?.weekday ?? anchorWeekday ?? 5, until })
    }
  }

  function toggleWeekday(day: number) {
    if (rule?.freq !== "weekly") return
    const has = rule.weekdays.includes(day)
    const weekdays = has ? rule.weekdays.filter((d) => d !== day) : [...rule.weekdays, day]
    if (weekdays.length === 0) return
    onRuleChange({ ...rule, weekdays: weekdays.sort((a, b) => a - b) })
  }

  function setUntil(next: Date | undefined) {
    if (!rule) return
    onRuleChange({ ...rule, until: next ? formatLocalDate(next) : null })
  }

  return (
    <Card>
      <CardHeader>
        <DashboardModalCardTitle>Schedule</DashboardModalCardTitle>
        <CardDescription>
          {isOccurrence
            ? "This is one date in a repeating series. Changes here apply only to this date."
            : "Set when this event happens, and whether it repeats."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Date + time */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Field className="sm:w-52">
            <FieldLabel htmlFor="schedule-date">Date</FieldLabel>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" id="schedule-date" disabled={disabled} className="w-full justify-between font-normal sm:w-52">
                  <span className="truncate" title={selectedDate ? format(selectedDate, "PPP") : "Select date"}>{selectedDate ? format(selectedDate, "PPP") : "Select date"}</span>
                  <ChevronDownIcon className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto overflow-hidden p-3" align="start">
                <Calendar
                  mode="single"
                  className="p-0"
                  selected={selectedDate}
                  captionLayout="dropdown"
                  defaultMonth={selectedDate}
                  onSelect={(d) => {
                    onDateChange(d ? formatLocalDate(d) : "")
                    setDateOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          </Field>
          <Field className="sm:w-32">
            <FieldLabel htmlFor="schedule-time">Time</FieldLabel>
            <Input
              id="schedule-time"
              type="time"
              disabled={disabled}
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            />
          </Field>
        </div>

        {/* Repeat — only the master event can define a repeat */}
        {isOccurrence ? (
          <p className="text-sm text-muted-foreground">
            To change how this event repeats, open the main event.
          </p>
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="recurrence-mode">Repeats</Label>
              <Select value={mode} onValueChange={(v) => changeMode(v as Mode)} disabled={disabled || !date}>
                <SelectTrigger id="recurrence-mode" className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-60">
                  <SelectItem value="none">Does not repeat</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              {!date && <p className="text-sm text-muted-foreground">Pick a date first to set a repeat.</p>}
            </div>

            {rule?.freq === "weekly" && (
              <div className="grid gap-2">
                <Label>On these days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((wd) => {
                    const active = rule.weekdays.includes(wd.value)
                    return (
                      <Button
                        key={wd.value}
                        type="button"
                        variant={active ? "default" : "outline"}
                        size="sm"
                        aria-pressed={active}
                        aria-label={wd.label}
                        disabled={disabled}
                        className="h-8 w-8 p-0"
                        onClick={() => toggleWeekday(wd.value)}
                      >
                        {wd.short}
                      </Button>
                    )
                  })}
                </div>
              </div>
            )}

            {rule?.freq === "monthly" && (
              <div className="grid gap-2">
                <Label>On the</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <Select value={String(rule.week)} onValueChange={(v) => onRuleChange({ ...rule, week: Number(v) })} disabled={disabled}>
                    <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-60">
                      {ORDINALS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={String(rule.weekday)} onValueChange={(v) => onRuleChange({ ...rule, weekday: Number(v) })} disabled={disabled}>
                    <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-60">
                      {WEEKDAYS.map((wd) => <SelectItem key={wd.value} value={String(wd.value)}>{wd.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground sm:mt-2">of each month</span>
                </div>
              </div>
            )}

            {rule && (
              <div className="grid gap-2">
                <Label>Ends</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" disabled={disabled} className="w-56 justify-between font-normal">
                        <span className="truncate" title={untilDate ? format(untilDate, "PPP") : "No end date"}>{untilDate ? format(untilDate, "PPP") : "No end date"}</span>
                        <ChevronDownIcon className="size-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto overflow-hidden p-3" align="start">
                      <Calendar mode="single" className="p-0" selected={untilDate} captionLayout="dropdown" defaultMonth={untilDate} onSelect={(d) => setUntil(d ?? undefined)} />
                    </PopoverContent>
                  </Popover>
                  {untilDate && (
                    <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setUntil(undefined)}>Clear</Button>
                  )}
                </div>
              </div>
            )}

            {rule && (
              <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                <Repeat className="size-4 shrink-0" />
                <span>{describeRecurrence(rule)}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
