"use client"

import { useCallback, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { FieldLabel as FieldHintLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  formatNewsletterSendWindows,
  getNewsletterSendWindows,
} from "@/lib/actions/newsletters/send-windows"

export function useDripSettings(defaultEnabled = false, defaultSendWindowEnabled = defaultEnabled) {
  const [enabled, setEnabled] = useState(defaultEnabled)
  const [batchMin, setBatchMin] = useState("")
  const [batchMax, setBatchMax] = useState("")
  const [intervalMin, setIntervalMin] = useState("")
  const [intervalMax, setIntervalMax] = useState("")
  const [bounceThreshold, setBounceThreshold] = useState("")
  const [sendWindowEnabled, setSendWindowEnabled] = useState(defaultSendWindowEnabled)
  const [sendWindowOneStart, setSendWindowOneStart] = useState("")
  const [sendWindowOneEnd, setSendWindowOneEnd] = useState("")
  const [sendWindowTwoStart, setSendWindowTwoStart] = useState("")
  const [sendWindowTwoEnd, setSendWindowTwoEnd] = useState("")
  const [sendWindowTimezone, setSendWindowTimezone] = useState("")
  const [skipWeekends, setSkipWeekends] = useState(false)

  const loadFromConfig = useCallback((config: Record<string, any> | null | undefined) => {
    setEnabled(config?.enabled === true)
    setBatchMin(config?.batch_size_min === undefined ? "" : String(config.batch_size_min))
    setBatchMax(config?.batch_size_max === undefined ? "" : String(config.batch_size_max))
    setIntervalMin(config?.interval_min_minutes === undefined ? "" : String(config.interval_min_minutes))
    setIntervalMax(config?.interval_max_minutes === undefined ? "" : String(config.interval_max_minutes))
    setBounceThreshold(config?.bounce_threshold_percent === undefined ? "" : String(config.bounce_threshold_percent))

    const sendWindows = getNewsletterSendWindows(config)
    setSendWindowEnabled(sendWindows.length > 0)
    setSendWindowOneStart(sendWindows[0]?.start || "")
    setSendWindowOneEnd(sendWindows[0]?.end || "")
    setSendWindowTwoStart(sendWindows[1]?.start || "")
    setSendWindowTwoEnd(sendWindows[1]?.end || "")
    setSendWindowTimezone(config?.send_window_timezone || "")
    setSkipWeekends(config?.skip_weekends === true)
  }, [])

  function validate() {
    const batchMinValue = Number(batchMin)
    const batchMaxValue = Number(batchMax)
    const intervalMinValue = Number(intervalMin)
    const intervalMaxValue = Number(intervalMax)
    const bounceThresholdValue = Number(bounceThreshold)
    const sendWindows = [
      { start: sendWindowOneStart, end: sendWindowOneEnd },
      { start: sendWindowTwoStart, end: sendWindowTwoEnd },
    ]
    if (enabled && (!batchMinValue || !batchMaxValue || batchMaxValue < batchMinValue)) {
      return "Batch size needs a valid min and max"
    }
    if (enabled && (!intervalMinValue || !intervalMaxValue || intervalMaxValue < intervalMinValue)) {
      return "Interval needs a valid min and max"
    }
    if (enabled && !bounceThresholdValue) {
      return "Bounce threshold is required"
    }
    if (enabled && sendWindowEnabled && sendWindows.some(window => !window.start || !window.end)) {
      return "Both send windows need a start and end time"
    }
    if (enabled && sendWindowEnabled && !sendWindowTimezone) {
      return "Send window timezone is required"
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
      batch_size_min: Number(batchMin),
      batch_size_max: Number(batchMax),
      interval_min_minutes: Number(intervalMin),
      interval_max_minutes: Number(intervalMax),
      bounce_threshold_percent: Number(bounceThreshold),
      skip_weekends: skipWeekends,
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
    skipWeekends,
    setSkipWeekends,
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
  variant?: "inline" | "cards"
}

function DripToggle({ form, idPrefix, disabled }: DripSettingsFieldsProps) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`${idPrefix}-drip-toggle`}
        checked={form.enabled}
        onCheckedChange={(checked) => form.setEnabled(checked === true)}
        disabled={disabled}
      />
      <Label htmlFor={`${idPrefix}-drip-toggle`}>Enable drip sending</Label>
    </div>
  )
}

function DripBatchFields({ form, idPrefix, disabled }: DripSettingsFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-drip-batch-min`}>Batch size min</FieldLabel>
          <Input
            id={`${idPrefix}-drip-batch-min`}
            type="number"
            value={form.batchMin}
            onChange={event => form.setBatchMin(event.target.value)}
            min={1}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-drip-batch-max`}>Batch size max</FieldLabel>
          <Input
            id={`${idPrefix}-drip-batch-max`}
            type="number"
            value={form.batchMax}
            onChange={event => form.setBatchMax(event.target.value)}
            min={1}
            disabled={disabled}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-drip-interval-min`}>Interval min (minutes)</FieldLabel>
          <Input
            id={`${idPrefix}-drip-interval-min`}
            type="number"
            value={form.intervalMin}
            onChange={event => form.setIntervalMin(event.target.value)}
            min={1}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-drip-interval-max`}>Interval max (minutes)</FieldLabel>
          <Input
            id={`${idPrefix}-drip-interval-max`}
            type="number"
            value={form.intervalMax}
            onChange={event => form.setIntervalMax(event.target.value)}
            min={1}
            disabled={disabled}
          />
        </Field>
      </div>
    </>
  )
}

function DripSafetyField({ form, idPrefix, disabled }: DripSettingsFieldsProps) {
  return (
    <Field>
      <FieldHintLabel
        htmlFor={`${idPrefix}-drip-bounce-threshold`}
        hint="Auto-pause and notify you if the bounce rate exceeds this percentage."
      >
        Bounce threshold (%)
      </FieldHintLabel>
      <Input
        id={`${idPrefix}-drip-bounce-threshold`}
        type="number"
        value={form.bounceThreshold}
        onChange={event => form.setBounceThreshold(event.target.value)}
        min={0.1}
        step="any"
        disabled={disabled}
      />
    </Field>
  )
}

function DripSendWindowFields({ form, idPrefix, disabled }: DripSettingsFieldsProps) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-skip-weekends`}
          checked={form.skipWeekends}
          onCheckedChange={(checked) => form.setSkipWeekends(checked === true)}
          disabled={disabled}
        />
        <Label htmlFor={`${idPrefix}-skip-weekends`}>Skip weekends</Label>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-send-window-toggle`}
          checked={form.sendWindowEnabled}
          onCheckedChange={(checked) => form.setSendWindowEnabled(checked === true)}
          disabled={disabled}
        />
        <Label htmlFor={`${idPrefix}-send-window-toggle`}>Limit sending to specific hours</Label>
      </div>

      {form.sendWindowEnabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-send-window-one-start`}>Start 1</FieldLabel>
                <Input
                  id={`${idPrefix}-send-window-one-start`}
                  type="time"
                  value={form.sendWindowOneStart}
                  onChange={event => form.setSendWindowOneStart(event.target.value)}
                  disabled={disabled}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-send-window-one-end`}>End 1</FieldLabel>
                <Input
                  id={`${idPrefix}-send-window-one-end`}
                  type="time"
                  value={form.sendWindowOneEnd}
                  onChange={event => form.setSendWindowOneEnd(event.target.value)}
                  disabled={disabled}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-send-window-two-start`}>Start 2</FieldLabel>
                <Input
                  id={`${idPrefix}-send-window-two-start`}
                  type="time"
                  value={form.sendWindowTwoStart}
                  onChange={event => form.setSendWindowTwoStart(event.target.value)}
                  disabled={disabled}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-send-window-two-end`}>End 2</FieldLabel>
                <Input
                  id={`${idPrefix}-send-window-two-end`}
                  type="time"
                  value={form.sendWindowTwoEnd}
                  onChange={event => form.setSendWindowTwoEnd(event.target.value)}
                  disabled={disabled}
                />
              </Field>
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-send-window-tz`}>Timezone</FieldLabel>
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
          </Field>

          <p className="text-xs text-muted-foreground">
            Emails will only be sent during {formatNewsletterSendWindows({ send_windows: [
              { start: form.sendWindowOneStart, end: form.sendWindowOneEnd },
              { start: form.sendWindowTwoStart, end: form.sendWindowTwoEnd },
            ] })} in the selected timezone
          </p>
        </>
      )}
    </div>
  )
}

export function DripSettingsFields({
  form,
  idPrefix,
  disabled = false,
  variant = "inline",
}: DripSettingsFieldsProps) {
  if (variant === "cards") {
    return (
      <>
        <Card>
          <CardHeader>
            <DashboardModalCardTitle>Delivery Mode</DashboardModalCardTitle>
          </CardHeader>
          <CardContent>
            <DripToggle form={form} idPrefix={idPrefix} disabled={disabled} />
          </CardContent>
        </Card>

        {form.enabled && (
          <>
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Batch & Timing</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <DripBatchFields form={form} idPrefix={idPrefix} disabled={disabled} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Safety</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <DripSafetyField form={form} idPrefix={idPrefix} disabled={disabled} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Send Windows</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <DripSendWindowFields form={form} idPrefix={idPrefix} disabled={disabled} />
              </CardContent>
            </Card>
          </>
        )}
      </>
    )
  }

  return (
    <div>
      <div className="mb-3">
        <DripToggle form={form} idPrefix={idPrefix} disabled={disabled} />
      </div>

      {form.enabled && (
        <div className="space-y-4">
          <DripBatchFields form={form} idPrefix={idPrefix} disabled={disabled} />
          <DripSafetyField form={form} idPrefix={idPrefix} disabled={disabled} />
          <div className="pt-2">
            <DripSendWindowFields form={form} idPrefix={idPrefix} disabled={disabled} />
          </div>
        </div>
      )}
    </div>
  )
}
