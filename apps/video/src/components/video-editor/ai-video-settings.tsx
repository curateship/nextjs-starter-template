import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  getAiVideoSettingsErrorMessage,
  loadAiVideoSettings,
  removeVideoKey,
  saveVideoKey,
  saveVideoModelDefaults,
  saveVideoRegion,
  testVideoKey,
  type AiVideoSettings,
  type VideoKeyStatus,
  type VideoStart,
} from "@/lib/api/video/ai-video-settings"
import { SHOT_LENGTHS, shotCostCents } from "@/lib/video/asset-factories"
import { formatCents } from "@/lib/video/project-spend"
import {
  COMPANY_NAMES,
  KEY_HELP,
  keyedSecondPrice,
  regionsFor,
  VIDEO_COMPANIES,
  VIDEO_MODELS,
  type KeyedCompany,
  type VideoCompany,
} from "@/lib/video/video-models"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** A pasted key saves itself this long after the last edit, as every setting does. */
const SAVE_DELAY_MS = 700

/** What a saved key's field shows while it is not being edited. */
const SAVED_SENTINEL = "••••••••••••"

/**
 * The tab's settings as last read or saved, held for the life of the page,
 * so coming back to this tab draws at once instead of loading again.
 */
let held: AiVideoSettings | null = null

function hold(next: AiVideoSettings) {
  held = next
  return next
}

/**
 * Settings → AI video: the Wan and Seedance keys, which company new AI shots
 * start on, what a Wan or Seedance shot starts with, and this month's AI
 * shots by company (`workspace/docs/wan-and-seedance.md`). Everything saves
 * by itself.
 */
export default function AiVideoSettingsPanel() {
  const [settings, setSettingsState] = React.useState<AiVideoSettings | null>(held)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const setSaveStatus = useReportedSaveStatus()

  React.useEffect(() => {
    if (held) return
    let cancelled = false
    loadAiVideoSettings()
      .then((loaded) => {
        hold(loaded)
        if (!cancelled) setSettingsState(loaded)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getAiVideoSettingsErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  function update(change: (current: AiVideoSettings) => AiVideoSettings) {
    if (!held) return
    setSettingsState(hold(change(held)))
  }

  function setKey(company: KeyedCompany, status: VideoKeyStatus) {
    update((current) => ({ ...current, keys: { ...current.keys, [company]: status } }))
  }

  // A pick shows at once and saves behind it. A refused save puts back what
  // was there.
  async function saveDefaults(
    change: Parameters<typeof saveVideoModelDefaults>[0],
    before: AiVideoSettings
  ) {
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      await saveVideoModelDefaults(change)
      setSaveStatus("saved")
    } catch (error) {
      setSettingsState(hold(before))
      setSaveStatus("idle")
      showErrorToast(getAiVideoSettingsErrorMessage(error))
    }
  }

  function pickCompany(company: VideoCompany) {
    if (!held) return
    const before = held
    update((current) => ({ ...current, company }))
    void saveDefaults({ company }, before)
  }

  function changeStart(company: KeyedCompany, start: VideoStart) {
    if (!held) return
    const before = held
    update((current) => ({ ...current, starts: { ...current.starts, [company]: start } }))
    void saveDefaults({ starts: { [company]: start } }, before)
  }

  if (loadError) {
    return (
      <CardGroup>
        <ErrorRow
          message={loadError}
          onRetry={() => {
            setLoadError(null)
            setReloads((count) => count + 1)
          }}
        />
      </CardGroup>
    )
  }
  if (!settings) {
    return (
      <CardGroup>
        <LoadingRow label="Loading the AI video settings…" />
      </CardGroup>
    )
  }

  return (
    <CardGroup>
      {(["wan", "seedance"] as const).map((company) => (
        <KeyCard
          key={company}
          company={company}
          status={settings.keys[company]}
          onStatus={(status) => setKey(company, status)}
        />
      ))}

      <CollapsibleSettingsCard
        storageId="video-ai-video-starts"
        title="New AI shots"
        description="Which company a new shot in the AI clip panel or Make it move starts on, and what a Wan or Seedance shot starts with. Any shot can still be switched before it is made."
      >
        <div className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="ai-video-company">New shots start on</Label>
            <Select
              value={settings.company}
              onValueChange={(value) => pickCompany(value as VideoCompany)}
            >
              <SelectTrigger id="ai-video-company" className="sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIDEO_COMPANIES.map((company) => {
                  const keyless = company !== "gemini" && !settings.keys[company].configured
                  return (
                    <SelectItem key={company} value={company} disabled={keyless}>
                      {VIDEO_MODELS[company].label}
                      {keyless ? " · add its key above first" : ""}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            {settings.company !== "gemini" && !settings.keys[settings.company].configured ? (
              <p className="text-sm text-muted-foreground">
                {COMPANY_NAMES[settings.company]} has no key now, so new shots start on Google
                until one is pasted.
              </p>
            ) : null}
          </div>
          {(["wan", "seedance"] as const).map((company) => (
            <StartFields
              key={company}
              company={company}
              start={settings.starts[company]}
              onChange={(start) => changeStart(company, start)}
            />
          ))}
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="video-ai-video-spend"
        title="This month"
        description="AI shot pieces that arrived this month for the whole app, and what they cost. A shot longer than 8 seconds is several pieces. Failed pieces cost nothing."
      >
        <ul className="grid gap-2 text-sm">
          {VIDEO_COMPANIES.map((company) => {
            const spend = settings.spend[company]
            return (
              <li key={company} className="flex items-baseline justify-between gap-4">
                <span>{VIDEO_MODELS[company].label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {spend.pieces
                    ? `${spend.pieces} ${spend.pieces === 1 ? "piece" : "pieces"}, ${formatCents(spend.cents)}`
                    : "Nothing yet this month"}
                </span>
              </li>
            )
          })}
        </ul>
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

/** One company's key: paste to save, Test, Remove, and the site it came from. */
function KeyCard({
  company,
  status,
  onStatus,
}: {
  company: KeyedCompany
  status: VideoKeyStatus
  onStatus: (status: VideoKeyStatus) => void
}) {
  const name = COMPANY_NAMES[company]
  const [draft, setDraft] = React.useState("")
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [running, setRunning] = React.useState<"test" | "remove" | null>(null)
  const [verdict, setVerdict] = React.useState("")
  const [removing, setRemoving] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useEffect(() => () => clearTimeout(timer.current), [])

  // `value` rides in as an argument: the timer saves exactly what was typed
  // when it was set.
  async function save(value: string) {
    const key = value.trim()
    if (!key) return
    setSaving(true)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      onStatus(await saveVideoKey(company, key))
      // A newer edit stays in the field and saves itself in turn.
      setDraft((current) => (current === value ? "" : current))
      setSaveStatus("saved")
    } catch (error) {
      // What was typed stays, so a refused save loses nothing.
      setSaveStatus("idle")
      showErrorToast(getAiVideoSettingsErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function flushSave() {
    clearTimeout(timer.current)
    if (!draft.trim() || saving) return
    void save(draft)
  }

  async function changeRegion(region: string) {
    const before = status
    onStatus({ ...status, region })
    setVerdict("")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      onStatus(await saveVideoRegion(company, region))
      setSaveStatus("saved")
    } catch (error) {
      onStatus(before)
      setSaveStatus("idle")
      showErrorToast(getAiVideoSettingsErrorMessage(error))
    }
  }

  async function test() {
    setRunning("test")
    setVerdict("")
    dismissErrorToast()
    try {
      const result = await testVideoKey(company, draft.trim() || undefined)
      setVerdict(result.ok ? `${name} accepted this key.` : result.message)
    } catch (error) {
      showErrorToast(getAiVideoSettingsErrorMessage(error))
    } finally {
      setRunning(null)
    }
  }

  async function remove() {
    setRunning("remove")
    dismissErrorToast()
    try {
      onStatus(await removeVideoKey(company))
      setVerdict("")
      setRemoving(false)
      toast.success(`${name} key removed.`)
    } catch (error) {
      showErrorToast(getAiVideoSettingsErrorMessage(error))
    } finally {
      setRunning(null)
    }
  }

  const showSentinel = !draft && !editing && status.configured
  const inputId = `ai-video-${company}-key`

  return (
    <CollapsibleSettingsCard
      storageId={`video-ai-video-${company}-key`}
      title={name}
      description={KEY_HELP[company]}
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <FieldLabel
              htmlFor={inputId}
              hint="Pasting a key saves it by itself. It is scrambled before it is stored, and only its last four characters are ever shown again."
            >
              API key
            </FieldLabel>
            <span className="text-sm text-muted-foreground">
              {status.unreadable
                ? "Saved, but unreadable. Paste it again."
                : status.configured
                  ? `Set ${status.maskedKey}`
                  : `Not set. ${name} shots need one.`}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={inputId}
              className="sm:flex-1"
              type="password"
              autoComplete="off"
              maxLength={300}
              placeholder={`Paste your ${name} API key`}
              value={showSentinel ? SAVED_SENTINEL : draft}
              onFocus={() => setEditing(true)}
              onBlur={() => {
                setEditing(false)
                flushSave()
              }}
              onChange={(event) => {
                const value = event.target.value
                setDraft(value)
                setVerdict("")
                clearTimeout(timer.current)
                if (value.trim()) {
                  timer.current = setTimeout(() => void save(value), SAVE_DELAY_MS)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") flushSave()
              }}
            />
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={running !== null}
                onClick={() => void test()}
              >
                {running === "test" ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Test this key
              </Button>
              {status.configured || status.unreadable ? (
                // Remove waits out a save in flight, so the two never race.
                <Button
                  type="button"
                  variant="outline"
                  disabled={running !== null || saving}
                  onClick={() => setRemoving(true)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          {verdict ? (
            <p role="status" className="text-sm text-muted-foreground">
              {verdict}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <FieldLabel
            htmlFor={`ai-video-${company}-region`}
            hint="A key works only at the address of the site it was made on. Pick the site you got it from."
          >
            Region
          </FieldLabel>
          <Select value={status.region} onValueChange={(value) => void changeRegion(value)}>
            <SelectTrigger id={`ai-video-${company}-region`} className="sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {regionsFor(company).map((region) => (
                <SelectItem key={region.id} value={region.id}>
                  {region.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ConfirmDialog
        open={removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(false)
        }}
        title={`Remove the ${name} key?`}
        description={`${name} shots stop until a key is pasted again. Shots already made stay in the library and on the timeline.`}
        confirmLabel="Remove key"
        loading={running === "remove"}
        onConfirm={remove}
      />
    </CollapsibleSettingsCard>
  )
}

/** What a new Wan or Seedance shot starts with, and what that costs. */
function StartFields({
  company,
  start,
  onChange,
}: {
  company: KeyedCompany
  start: VideoStart
  onChange: (start: VideoStart) => void
}) {
  const model = VIDEO_MODELS[company]
  const idPrefix = `ai-video-${company}`
  const sound = model.soundSwitch ? start.sound : true
  const cents = shotCostCents(start.length, model.id, start.size, sound)
  return (
    <div className="grid gap-4">
      <p className="text-sm font-medium">{model.label}</p>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-size`}>Size</Label>
          <Select
            value={start.size}
            onValueChange={(value) => onChange({ ...start, size: value as VideoStart["size"] })}
          >
            <SelectTrigger id={`${idPrefix}-size`} className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {model.sizes.map((size) => (
                <SelectItem key={size} value={size}>
                  {size} · {keyedSecondPrice(company, size, sound)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-length`}>Length</Label>
          <Select
            value={String(start.length)}
            onValueChange={(value) =>
              onChange({ ...start, length: Number(value) as VideoStart["length"] })
            }
          >
            <SelectTrigger id={`${idPrefix}-length`} className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHOT_LENGTHS.map((length) => (
                <SelectItem key={length} value={String(length)}>
                  {length} seconds
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {model.soundSwitch ? (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${idPrefix}-sound`}>Make its own sound (costs twice as much)</Label>
          <Switch
            id={`${idPrefix}-sound`}
            checked={start.sound}
            onCheckedChange={(on) => onChange({ ...start, sound: on })}
          />
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        A shot like this costs about {formatCents(cents)}.
      </p>
    </div>
  )
}
