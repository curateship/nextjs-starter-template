import { type FormEvent, useEffect, useState } from "react"
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
  type ScheduleRecord,
} from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { SurfaceCard } from "@/components/surface-card"

const defaultTimezone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto"

export function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([])
  const [keyword, setKeyword] = useState("")
  const [area, setArea] = useState("")
  const [maxPlaces, setMaxPlaces] = useState("100")
  const [cadence, setCadence] = useState<"daily" | "weekly" | "monthly">("daily")
  const [timezone, setTimezone] = useState(defaultTimezone)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const response = await listSchedules()

        if (!active) {
          return
        }

        setSchedules(response.schedules)
      } catch (caughtError) {
        if (!active) {
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : "Failed to load schedules")
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsedMaxPlaces = Number(maxPlaces)
    if (!keyword.trim() || !area.trim()) {
      setError("Keyword and area are required")
      return
    }

    if (!Number.isInteger(parsedMaxPlaces) || parsedMaxPlaces < 1 || parsedMaxPlaces > 250) {
      setError("Max places must be an integer between 1 and 250")
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const response = await createSchedule({
        keyword: keyword.trim(),
        area: area.trim(),
        max_places: parsedMaxPlaces,
        cadence,
        timezone: timezone.trim() || defaultTimezone,
      })

      setSchedules((current) => [response.schedule, ...current])
      setKeyword("")
      setArea("")
      setMaxPlaces("100")
      setCadence("daily")
      setTimezone(defaultTimezone)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create schedule")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggle(schedule: ScheduleRecord) {
    try {
      const response = await updateSchedule(schedule.id, { active: !schedule.active })
      setSchedules((current) =>
        current.map((item) => (item.id === schedule.id ? response.schedule : item))
      )
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to update schedule")
    }
  }

  async function handleDelete(scheduleId: string) {
    try {
      await deleteSchedule(scheduleId)
      setSchedules((current) => current.filter((item) => item.id !== scheduleId))
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to delete schedule")
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <SurfaceCard
        title="Create Schedule"
        description="Schedules only store the fixed Google Maps input plus cadence and timezone."
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Keyword</span>
            <input
              className="h-11 rounded-2xl border border-input bg-background px-4"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Area</span>
            <input
              className="h-11 rounded-2xl border border-input bg-background px-4"
              value={area}
              onChange={(event) => setArea(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Max places</span>
            <input
              className="h-11 rounded-2xl border border-input bg-background px-4"
              value={maxPlaces}
              onChange={(event) => setMaxPlaces(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Cadence</span>
            <select
              className="h-11 rounded-2xl border border-input bg-background px-4"
              value={cadence}
              onChange={(event) => setCadence(event.target.value as "daily" | "weekly" | "monthly")}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Timezone</span>
            <input
              className="h-11 rounded-2xl border border-input bg-background px-4"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 items-center rounded-2xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Create schedule"}
          </button>
        </form>
      </SurfaceCard>

      <SurfaceCard title="Existing Schedules" description="Pause a schedule without deleting it when you want to preserve the query shape.">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading schedules...</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No schedules created yet.</p>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold">{schedule.keyword}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{schedule.area}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggle(schedule)}
                      className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted"
                    >
                      {schedule.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(schedule.id)}
                      className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                  <p>Cadence: {schedule.cadence}</p>
                  <p>Timezone: {schedule.timezone}</p>
                  <p>Next: {formatDateTime(schedule.next_run_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  )
}
