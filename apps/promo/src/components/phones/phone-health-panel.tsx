import * as React from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getPhoneHealthErrorMessage, loadPhoneReadings, type PhoneReading } from "@/lib/api/phones/health"
import type { PhoneRecord } from "@/lib/api/phones/phones"
import { formatTimeAgo } from "@/lib/format/format-time"
import { APP_WORDS, HOT_C, TRACKED_APPS } from "@/lib/phones/options"
import { signalWords } from "@/lib/phones/wording"

const chartConfig: ChartConfig = {
  batteryPercent: { label: "Battery, out of 100", color: "var(--foreground)" },
  temperatureC: { label: "Heat, °C", color: "var(--destructive)" },
}

const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" })
const pointFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
})

/**
 * The phone's health: what the rack read off it in the last minute, its
 * battery and heat over four weeks (part 19 of the phone farm), and the
 * version of each app Promo keeps an eye on (part 21).
 *
 * The chart has a point every ten minutes and one at every reading at 45°C
 * or more, so a short spike shows when it happened. The dashed line is the
 * 45°C the bell rings at.
 */
export function PhoneHealthPanel({ phone }: { phone: PhoneRecord }) {
  const [readings, setReadings] = React.useState<PhoneReading[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadPhoneReadings(phone.id).then(
      (next) => {
        if (!live) return
        setReadings(next)
        setError(null)
      },
      (loadError: unknown) => {
        if (live) setError(getPhoneHealthErrorMessage(loadError))
      }
    )
    return () => {
      live = false
    }
  }, [phone.id, attempt])

  const { vitals } = phone
  const data = React.useMemo(
    () =>
      (readings ?? []).map((reading) => ({
        at: new Date(reading.at).getTime(),
        batteryPercent: reading.batteryPercent,
        temperatureC: reading.temperatureC,
      })),
    [readings]
  )

  return (
    <div className="grid gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Now</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {vitals.at ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <Figure label="Battery" value={vitals.batteryPercent === null ? "Not read" : `${vitals.batteryPercent} out of 100`} />
              <Figure
                label="Heat"
                value={
                  vitals.temperatureC === null
                    ? "Not read"
                    : `${vitals.temperatureC.toFixed(1)}°C${vitals.temperatureC > HOT_C ? ", too hot" : ""}`
                }
                warn={vitals.temperatureC !== null && vitals.temperatureC > HOT_C}
              />
              <Figure
                label="Storage used"
                value={vitals.storageUsedPercent === null ? "Not read" : `${vitals.storageUsedPercent} out of 100`}
              />
              <Figure label="Signal" value={phone.connection === "sim" ? signalWords(vitals.signal) : "On Wi-Fi"} />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              No reading yet. The rack reads the battery, heat, storage and signal once a minute
              while the phone is plugged in.
            </p>
          )}
          {vitals.at ? (
            <p className="text-xs text-muted-foreground">Read {formatTimeAgo(vitals.at).toLowerCase()}.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Battery and heat, last four weeks</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error ? (
            <ErrorRow message={error} onRetry={() => setAttempt((count) => count + 1)} />
          ) : !readings ? (
            <LoadingRow label="Reading the chart" className="min-h-48" />
          ) : !data.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No readings yet. A point is kept every ten minutes.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-0.5 w-4 rounded-full bg-foreground" />
                  Battery, out of 100
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-0.5 w-4 rounded-full bg-destructive" />
                  Heat, °C
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="w-4 border-t border-dashed border-destructive" />
                  {HOT_C}°C, where the bell rings
                </span>
              </div>
              <div className="h-[240px] w-full min-w-0">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <LineChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} />
                    <XAxis
                      dataKey="at"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10 }}
                      dy={6}
                      tickFormatter={(value: number) => dayFormat.format(new Date(value))}
                    />
                    <YAxis
                      yAxisId="battery"
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, dx: -5 }}
                      width={32}
                    />
                    <YAxis
                      yAxisId="heat"
                      orientation="right"
                      domain={[0, (max: number) => Math.max(50, Math.ceil(max / 5) * 5)]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, dx: 5 }}
                      width={32}
                      unit="°"
                    />
                    <ReferenceLine yAxisId="heat" y={HOT_C} stroke="var(--destructive)" strokeDasharray="4 4" />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) => {
                            const at = payload?.[0]?.payload?.at
                            return typeof at === "number" ? pointFormat.format(new Date(at)) : ""
                          }}
                        />
                      }
                    />
                    <Line
                      yAxisId="battery"
                      dataKey="batteryPercent"
                      type="monotone"
                      isAnimationActive={false}
                      stroke="var(--color-batteryPercent)"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      yAxisId="heat"
                      dataKey="temperatureC"
                      type="monotone"
                      isAnimationActive={false}
                      stroke="var(--color-temperatureC)"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ChartContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Apps</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            {TRACKED_APPS.map((app) => (
              <Figure key={app} label={APP_WORDS[app]} value={phone.apps[app] ?? "Not installed"} />
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            Read every ten minutes. New versions go onto the self-test phone first, from Self-test on
            the Phones dashboard.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function Figure({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={warn ? "font-medium text-destructive" : "font-medium"}>{value}</dd>
    </div>
  )
}
