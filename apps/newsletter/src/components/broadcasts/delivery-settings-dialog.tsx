import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { listContactTags } from "@/lib/api/broadcasts"
import type { BroadcastAudienceFilter } from "@/lib/broadcasts/blocks"
import {
  DEFAULT_DRIP_FORM_VALUES,
  broadcastDripConfigSchema,
  type BroadcastDripConfig,
} from "@/lib/broadcasts/drip"

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "UTC", label: "UTC" },
]

function NumberInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export function DeliverySettingsDialog({
  open,
  onOpenChange,
  audienceFilter,
  dripConfig,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  audienceFilter: BroadcastAudienceFilter
  dripConfig: BroadcastDripConfig
  onApply: (
    audienceFilter: BroadcastAudienceFilter,
    dripConfig: BroadcastDripConfig
  ) => void
}) {
  const [availableTags, setAvailableTags] = React.useState<string[]>([])
  const [audienceKind, setAudienceKind] = React.useState<"all" | "tags">("all")
  const [selectedTags, setSelectedTags] = React.useState<string[]>([])
  const [dripEnabled, setDripEnabled] = React.useState(false)
  const [batchMin, setBatchMin] = React.useState("")
  const [batchMax, setBatchMax] = React.useState("")
  const [intervalMin, setIntervalMin] = React.useState("")
  const [intervalMax, setIntervalMax] = React.useState("")
  const [failureThreshold, setFailureThreshold] = React.useState("")
  const [skipWeekends, setSkipWeekends] = React.useState(false)
  const [windowEnabled, setWindowEnabled] = React.useState(false)
  const [windowOneStart, setWindowOneStart] = React.useState("08:00")
  const [windowOneEnd, setWindowOneEnd] = React.useState("13:00")
  const [windowTwoStart, setWindowTwoStart] = React.useState("")
  const [windowTwoEnd, setWindowTwoEnd] = React.useState("")
  const [timezone, setTimezone] = React.useState("America/New_York")
  const [error, setError] = React.useState<string | null>(null)

  // Re-initialize the form whenever the dialog opens (render-time state
  // adjustment instead of a setState-in-effect).
  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setError(null)
      setAudienceKind(audienceFilter.kind)
      setSelectedTags(audienceFilter.kind === "tags" ? audienceFilter.tags : [])
      setDripEnabled(dripConfig.enabled)
      if (dripConfig.enabled) {
        setBatchMin(String(dripConfig.batchSizeMin))
        setBatchMax(String(dripConfig.batchSizeMax))
        setIntervalMin(String(dripConfig.intervalMinMinutes))
        setIntervalMax(String(dripConfig.intervalMaxMinutes))
        setFailureThreshold(String(dripConfig.failureThresholdPercent))
        setSkipWeekends(dripConfig.skipWeekends)
        setWindowEnabled(dripConfig.sendWindows.length > 0)
        setWindowOneStart(dripConfig.sendWindows[0]?.start ?? "08:00")
        setWindowOneEnd(dripConfig.sendWindows[0]?.end ?? "13:00")
        setWindowTwoStart(dripConfig.sendWindows[1]?.start ?? "")
        setWindowTwoEnd(dripConfig.sendWindows[1]?.end ?? "")
        setTimezone(dripConfig.sendWindowTimezone)
      } else {
        setBatchMin(String(DEFAULT_DRIP_FORM_VALUES.batchSizeMin))
        setBatchMax(String(DEFAULT_DRIP_FORM_VALUES.batchSizeMax))
        setIntervalMin(String(DEFAULT_DRIP_FORM_VALUES.intervalMinMinutes))
        setIntervalMax(String(DEFAULT_DRIP_FORM_VALUES.intervalMaxMinutes))
        setFailureThreshold(
          String(DEFAULT_DRIP_FORM_VALUES.failureThresholdPercent)
        )
        setSkipWeekends(false)
        setWindowEnabled(false)
        setWindowOneStart("08:00")
        setWindowOneEnd("13:00")
        setWindowTwoStart("")
        setWindowTwoEnd("")
        setTimezone("America/New_York")
      }
    }
  }

  React.useEffect(() => {
    if (!open) return
    let active = true
    listContactTags()
      .then((data) => {
        if (active) setAvailableTags(data.tags)
      })
      .catch(() => {
        if (active) setAvailableTags([])
      })
    return () => {
      active = false
    }
  }, [open])

  const toggleTag = (tag: string) => {
    setSelectedTags((tags) =>
      tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]
    )
  }

  const apply = () => {
    if (audienceKind === "tags" && selectedTags.length === 0) {
      setError("Pick at least one tag, or switch the audience back to all.")
      return
    }

    let nextDrip: BroadcastDripConfig = { enabled: false }
    if (dripEnabled) {
      const windows = windowEnabled
        ? [
            { start: windowOneStart, end: windowOneEnd },
            ...(windowTwoStart && windowTwoEnd
              ? [{ start: windowTwoStart, end: windowTwoEnd }]
              : []),
          ]
        : []
      const parsed = broadcastDripConfigSchema.safeParse({
        enabled: true,
        batchSizeMin: Number(batchMin),
        batchSizeMax: Number(batchMax),
        intervalMinMinutes: Number(intervalMin),
        intervalMaxMinutes: Number(intervalMax),
        failureThresholdPercent: Number(failureThreshold),
        skipWeekends,
        sendWindows: windows,
        sendWindowTimezone: timezone,
      })
      if (!parsed.success) {
        setError(
          parsed.error.issues[0]?.message ?? "Check the drip settings values."
        )
        return
      }
      nextDrip = parsed.data
    }

    onApply(
      audienceKind === "all" ? { kind: "all" } : { kind: "tags", tags: selectedTags },
      nextDrip
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delivery settings</DialogTitle>
          <DialogDescription>
            Choose who receives this broadcast and how fast it goes out.
            Changes apply when you save the broadcast.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Audience</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="audience-kind">Send to</Label>
                  <Select
                    value={audienceKind}
                    onValueChange={(value) =>
                      setAudienceKind(value as "all" | "tags")
                    }
                  >
                    <SelectTrigger id="audience-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="all">
                        All subscribed contacts
                      </SelectItem>
                      <SelectItem value="tags">
                        Contacts with any of these tags
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {audienceKind === "tags" ? (
                  availableTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tags exist yet. Tags arrive with contacts through the
                      ingest API or automations.
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {availableTags.map((tag) => (
                        <div key={tag} className="flex items-center gap-2">
                          <Checkbox
                            id={`audience-tag-${tag}`}
                            checked={selectedTags.includes(tag)}
                            onCheckedChange={() => toggleTag(tag)}
                          />
                          <Label htmlFor={`audience-tag-${tag}`}>{tag}</Label>
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Drip sending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="drip-enabled"
                    checked={dripEnabled}
                    onCheckedChange={(checked) =>
                      setDripEnabled(checked === true)
                    }
                  />
                  <Label htmlFor="drip-enabled">
                    Send in randomized batches instead of all at once
                  </Label>
                </div>

                {dripEnabled ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberInput
                        id="drip-batch-min"
                        label="Batch size min"
                        value={batchMin}
                        onChange={setBatchMin}
                      />
                      <NumberInput
                        id="drip-batch-max"
                        label="Batch size max"
                        value={batchMax}
                        onChange={setBatchMax}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberInput
                        id="drip-interval-min"
                        label="Interval min (minutes)"
                        value={intervalMin}
                        onChange={setIntervalMin}
                      />
                      <NumberInput
                        id="drip-interval-max"
                        label="Interval max (minutes)"
                        value={intervalMax}
                        onChange={setIntervalMax}
                      />
                    </div>
                    <div className="grid gap-1">
                      <NumberInput
                        id="drip-failure-threshold"
                        label="Auto-pause at failure rate (%)"
                        value={failureThreshold}
                        onChange={setFailureThreshold}
                      />
                      <p className="text-xs text-muted-foreground">
                        Sending pauses automatically when this share of sends
                        fails, so a bad list or provider issue can't burn
                        your domain.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="drip-skip-weekends"
                        checked={skipWeekends}
                        onCheckedChange={(checked) =>
                          setSkipWeekends(checked === true)
                        }
                      />
                      <Label htmlFor="drip-skip-weekends">Skip weekends</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="drip-window-enabled"
                        checked={windowEnabled}
                        onCheckedChange={(checked) =>
                          setWindowEnabled(checked === true)
                        }
                      />
                      <Label htmlFor="drip-window-enabled">
                        Only send during specific hours
                      </Label>
                    </div>
                    {windowEnabled ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1">
                            <Label htmlFor="window-one-start">
                              Window 1 start
                            </Label>
                            <Input
                              id="window-one-start"
                              type="time"
                              value={windowOneStart}
                              onChange={(event) =>
                                setWindowOneStart(event.target.value)
                              }
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label htmlFor="window-one-end">
                              Window 1 end
                            </Label>
                            <Input
                              id="window-one-end"
                              type="time"
                              value={windowOneEnd}
                              onChange={(event) =>
                                setWindowOneEnd(event.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1">
                            <Label htmlFor="window-two-start">
                              Window 2 start (optional)
                            </Label>
                            <Input
                              id="window-two-start"
                              type="time"
                              value={windowTwoStart}
                              onChange={(event) =>
                                setWindowTwoStart(event.target.value)
                              }
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label htmlFor="window-two-end">
                              Window 2 end (optional)
                            </Label>
                            <Input
                              id="window-two-end"
                              type="time"
                              value={windowTwoEnd}
                              onChange={(event) =>
                                setWindowTwoEnd(event.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="window-timezone">Timezone</Label>
                          <Select value={timezone} onValueChange={setTimezone}>
                            <SelectTrigger id="window-timezone">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {TIMEZONE_OPTIONS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={apply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
