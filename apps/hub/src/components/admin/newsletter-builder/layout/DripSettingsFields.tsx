"use client"

import { useCallback, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DEFAULT_NEWSLETTER_SEND_WINDOWS,
  formatNewsletterSendWindows,
  getNewsletterSendWindows,
} from "@/lib/actions/newsletters/send-windows"

export function useDripSettings(defaultEnabled = false, defaultSendWindowEnabled = defaultEnabled) {
  const [enabled, setEnabled] = useState(defaultEnabled)
  const [batchMin, setBatchMin] = useState("400")
  const [batchMax, setBatchMax] = useState("500")
  const [intervalMin, setIntervalMin] = useState("30")
  const [intervalMax, setIntervalMax] = useState("60")
  const [bounceThreshold, setBounceThreshold] = useState("5")
  const [sendWindowEnabled, setSendWindowEnabled] = useState(defaultSendWindowEnabled)
  const [sendWindowOneStart, setSendWindowOneStart] = useState(DEFAULT_NEWSLETTER_SEND_WINDOWS[0].start)
  const [sendWindowOneEnd, setSendWindowOneEnd] = useState(DEFAULT_NEWSLETTER_SEND_WINDOWS[0].end)
  const [sendWindowTwoStart, setSendWindowTwoStart] = useState(DEFAULT_NEWSLETTER_SEND_WINDOWS[1].start)
  const [sendWindowTwoEnd, setSendWindowTwoEnd] = useState(DEFAULT_NEWSLETTER_SEND_WINDOWS[1].end)
  const [sendWindowTimezone, setSendWindowTimezone] = useState("America/New_York")

  const loadFromConfig = useCallback((config: Record<string, any> | null | undefined) => {
    setEnabled(config?.enabled === true)
    setBatchMin(String(config?.batch_size_min ?? 400))
    setBatchMax(String(config?.batch_size_max ?? 500))
    setIntervalMin(String(config?.interval_min_minutes ?? 30))
    setIntervalMax(String(config?.interval_max_minutes ?? 60))
    setBounceThreshold(String(config?.bounce_threshold_percent ?? 5))

    const sendWindows = getNewsletterSendWindows(config)
    setSendWindowEnabled(sendWindows.length > 0)
    setSendWindowOneStart(sendWindows[0]?.start || DEFAULT_NEWSLETTER_SEND_WINDOWS[0].start)
    setSendWindowOneEnd(sendWindows[0]?.end || DEFAULT_NEWSLETTER_SEND_WINDOWS[0].end)
    setSendWindowTwoStart(sendWindows[1]?.start || DEFAULT_NEWSLETTER_SEND_WINDOWS[1].start)
    setSendWindowTwoEnd(sendWindows[1]?.end || DEFAULT_NEWSLETTER_SEND_WINDOWS[1].end)
    setSendWindowTimezone(config?.send_window_timezone || "America/New_York")
  }, [])

  function validate() {
    const sendWindows = [
      { start: sendWindowOneStart, end: sendWindowOneEnd },
      { start: sendWindowTwoStart, end: sendWindowTwoEnd },
    ]
    if (enabled && sendWindowEnabled && sendWindows.some(window => !window.start || !window.end)) {
      return "Both send windows need a start and end time"
    }
    return null
  }

  function buildConfig() {
    const sendWindows = [
      { start: sendWindowOneStart, end: sendWindowOneEnd },
      { start: sendWindowTwoStart, end: sendWindowTwoEnd },
    ]

    if (!enabled) return { enabled: false }

    return {
      enabled: true,
      batch_size_min: parseInt(batchMin) || 400,
      batch_size_max: parseInt(batchMax) || 500,
      interval_min_minutes: parseInt(intervalMin) || 30,
      interval_max_minutes: parseInt(intervalMax) || 60,
      bounce_threshold_percent: parseFloat(bounceThreshold) || 5,
      ...(sendWindowEnabled ? {
        send_windows: sendWindows,
        send_window_start: sendWindows[0].start,
        send_window_end: sendWindows[0].end,
        send_window_timezone: sendWindowTimezone,
      } : {
        send_windows: [],
        send_window_start: null,
        send_window_end: null,
        send_window_timezone: null,
      }),
    }
  }

  return {
    enabled,
    setEnabled,
    batchMin,
    setBatchMin,
    batchMax,
    setBatchMax,
    intervalMin,
    setIntervalMin,
    intervalMax,
    setIntervalMax,
    bounceThreshold,
    setBounceThreshold,
    sendWindowEnabled,
    setSendWindowEnabled,
    sendWindowOneStart,
    setSendWindowOneStart,
    sendWindowOneEnd,
    setSendWindowOneEnd,
    sendWindowTwoStart,
    setSendWindowTwoStart,
    sendWindowTwoEnd,
    setSendWindowTwoEnd,
    sendWindowTimezone,
    setSendWindowTimezone,
    loadFromConfig,
    validate,
    buildConfig,
  }
}

type DripSettingsForm = ReturnType<typeof useDripSettings>

interface DripSettingsFieldsProps {
  form: DripSettingsForm
  idPrefix: string
  disabled?: boolean
}

export function DripSettingsFields({ form, idPrefix, disabled = false }: DripSettingsFieldsProps) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-drip-toggle`}
          checked={form.enabled}
          onCheckedChange={(checked) => form.setEnabled(checked === true)}
          disabled={disabled}
        />
        <Label htmlFor={`${idPrefix}-drip-toggle`}>Enable drip sending</Label>
      </div>

      {form.enabled && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label htmlFor={`${idPrefix}-drip-batch-min`}>Batch size min</Label>
              <Input
                id={`${idPrefix}-drip-batch-min`}
                type="number"
                value={form.batchMin}
                onChange={event => form.setBatchMin(event.target.value)}
                min={1}
                disabled={disabled}
              />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}-drip-batch-max`}>Batch size max</Label>
              <Input
                id={`${idPrefix}-drip-batch-max`}
                type="number"
                value={form.batchMax}
                onChange={event => form.setBatchMax(event.target.value)}
                min={1}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label htmlFor={`${idPrefix}-drip-interval-min`}>Interval min (minutes)</Label>
              <Input
                id={`${idPrefix}-drip-interval-min`}
                type="number"
                value={form.intervalMin}
                onChange={event => form.setIntervalMin(event.target.value)}
                min={1}
                disabled={disabled}
              />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}-drip-interval-max`}>Interval max (minutes)</Label>
              <Input
                id={`${idPrefix}-drip-interval-max`}
                type="number"
                value={form.intervalMax}
                onChange={event => form.setIntervalMax(event.target.value)}
                min={1}
                disabled={disabled}
              />
            </div>
          </div>

          <div>
            <Label htmlFor={`${idPrefix}-drip-bounce-threshold`}>Bounce threshold (%)</Label>
            <Input
              id={`${idPrefix}-drip-bounce-threshold`}
              type="number"
              value={form.bounceThreshold}
              onChange={event => form.setBounceThreshold(event.target.value)}
              min={0.1}
              step="any"
              disabled={disabled}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Auto-pause and notify you if bounce rate exceeds this percentage
            </p>
          </div>

          <div className="pt-2">
            <div className="mb-3 flex items-center gap-2">
              <Checkbox
                id={`${idPrefix}-send-window-toggle`}
                checked={form.sendWindowEnabled}
                onCheckedChange={(checked) => form.setSendWindowEnabled(checked === true)}
                disabled={disabled}
              />
              <Label htmlFor={`${idPrefix}-send-window-toggle`}>Limit sending to specific hours</Label>
            </div>

            {form.sendWindowEnabled && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`${idPrefix}-send-window-one-start`}>Start 1</Label>
                      <Input
                        id={`${idPrefix}-send-window-one-start`}
                        type="time"
                        value={form.sendWindowOneStart}
                        onChange={event => form.setSendWindowOneStart(event.target.value)}
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${idPrefix}-send-window-one-end`}>End 1</Label>
                      <Input
                        id={`${idPrefix}-send-window-one-end`}
                        type="time"
                        value={form.sendWindowOneEnd}
                        onChange={event => form.setSendWindowOneEnd(event.target.value)}
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`${idPrefix}-send-window-two-start`}>Start 2</Label>
                      <Input
                        id={`${idPrefix}-send-window-two-start`}
                        type="time"
                        value={form.sendWindowTwoStart}
                        onChange={event => form.setSendWindowTwoStart(event.target.value)}
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${idPrefix}-send-window-two-end`}>End 2</Label>
                      <Input
                        id={`${idPrefix}-send-window-two-end`}
                        type="time"
                        value={form.sendWindowTwoEnd}
                        onChange={event => form.setSendWindowTwoEnd(event.target.value)}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor={`${idPrefix}-send-window-tz`}>Timezone</Label>
                  <Select value={form.sendWindowTimezone} onValueChange={form.setSendWindowTimezone} disabled={disabled}>
                    <SelectTrigger id={`${idPrefix}-send-window-tz`} size="button">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-60">
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <p className="text-xs text-muted-foreground">
                  Emails will only be sent during {formatNewsletterSendWindows({ send_windows: [
                    { start: form.sendWindowOneStart, end: form.sendWindowOneEnd },
                    { start: form.sendWindowTwoStart, end: form.sendWindowTwoEnd },
                  ] })} in the selected timezone
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
