import * as React from "react"
import { CheckIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"

import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
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
  getProjectErrorMessage,
  loadCurrentProject,
  loadLanguages,
  loadLocations,
  scheduleFrequencyLabels,
  syncLocations,
  updateProject,
  type LanguageOption,
  type LocationOption,
  type ScheduleFrequency,
} from "@/lib/api/seo-projects"

type ProjectSettingsForm = {
  domain: string
  locationCode: number
  languageCode: string
  scheduleFrequency: ScheduleFrequency
}

export function ProjectSettings() {
  const [projectId, setProjectId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<ProjectSettingsForm>({
    domain: "",
    locationCode: 2840,
    languageCode: "en",
    scheduleFrequency: "manual",
  })
  const [locations, setLocations] = React.useState<LocationOption[]>([])
  const [languages, setLanguages] = React.useState<LanguageOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([loadCurrentProject(), loadLocations()])
      .then(([{ project }, locationData]) => {
        if (!active) return
        setProjectId(project.id)
        setForm({
          domain: project.domain ?? "",
          locationCode: project.locationCode,
          languageCode: project.languageCode,
          scheduleFrequency: project.scheduleFrequency,
        })
        setLocations(locationData.locations)
      })
      .catch((loadError) => {
        if (active) setError(getProjectErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    if (loading) return
    let active = true
    loadLanguages(form.locationCode)
      .then((data) => {
        if (!active) return
        setLanguages(data.languages)
        setForm((current) =>
          data.languages.some(
            (language) => language.languageCode === current.languageCode
          )
            ? current
            : {
                ...current,
                languageCode: data.languages[0]?.languageCode ?? "en",
              }
        )
      })
      .catch((loadError) => setError(getProjectErrorMessage(loadError)))
    return () => {
      active = false
    }
  }, [form.locationCode, loading])

  async function save() {
    if (!projectId) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await updateProject(projectId, {
        domain: form.domain,
        locationCode: form.locationCode,
        languageCode: form.languageCode,
        scheduleFrequency: form.scheduleFrequency,
      })
      setSaved(true)
    } catch (saveError) {
      setError(getProjectErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function refreshLocations() {
    setSyncing(true)
    setError(null)
    try {
      await syncLocations()
      const data = await loadLocations()
      setLocations(data.locations)
    } catch (syncError) {
      setError(getProjectErrorMessage(syncError))
    } finally {
      setSyncing(false)
    }
  }

  const busy = saving || syncing

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Loading project settings...
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-medium">Project</h2>
        <p className="text-sm text-muted-foreground">
          The domain, target market, and automatic-check schedule used for
          keyword research and rank tracking.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="settings-domain">Domain</Label>
          <Input
            id="settings-domain"
            placeholder="example.com"
            value={form.domain}
            disabled={busy}
            onChange={(event) =>
              setForm({ ...form, domain: event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            Required for domain research, competitor gap, and rank tracking.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="settings-location">Target location</Label>
          <Select
            value={String(form.locationCode)}
            disabled={busy || !locations.length}
            onValueChange={(value) =>
              setForm({ ...form, locationCode: Number(value) })
            }
          >
            <SelectTrigger id="settings-location" className="w-full">
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((location) => (
                <SelectItem
                  key={location.locationCode}
                  value={String(location.locationCode)}
                >
                  {location.locationName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="settings-language">Target language</Label>
          <Select
            value={form.languageCode}
            disabled={busy || !languages.length}
            onValueChange={(value) =>
              setForm({ ...form, languageCode: value })
            }
          >
            <SelectTrigger id="settings-language" className="w-full">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map((language) => (
                <SelectItem
                  key={language.languageCode}
                  value={language.languageCode}
                >
                  {language.languageName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="settings-schedule">Automatic checks</Label>
          <Select
            value={form.scheduleFrequency}
            disabled={busy}
            onValueChange={(value) =>
              setForm({ ...form, scheduleFrequency: value as ScheduleFrequency })
            }
          >
            <SelectTrigger id="settings-schedule" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(scheduleFrequencyLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            disabled={busy}
            onClick={() => void refreshLocations()}
          >
            {syncing ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3" />
            )}
            Refresh locations from DataForSEO
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <DashboardToolbarButton
          type="button"
          disabled={busy}
          onClick={() => void save()}
        >
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {saving ? "Saving..." : "Save"}
        </DashboardToolbarButton>
        {saved ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckIcon className="size-4" />
            Saved
          </span>
        ) : null}
      </div>
    </div>
  )
}
