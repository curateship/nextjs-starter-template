import * as React from "react"
import { Loader2Icon, PlusIcon, TagsIcon, Trash2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  addHookTypeFn,
  deleteHookTypeFn,
  labelOldHooksFn,
  loadHookTypeSettings,
  type HookTypeSettings,
} from "@/lib/api/viral/viral-hook-types"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cleanHookTypeName, FIXED_HOOK_TYPES, HOOK_TYPE_NAME_MAX, type OwnHookType } from "@/lib/viral/hook-types"
import { writerPriceWords } from "@/lib/viral/writers"

/** The settings as last read, held for the life of the page, so coming back to the tab draws at once. */
let held: HookTypeSettings | null = null

/**
 * Settings → Hook types (`workspace/docs/library.md`, more-features task part
 * 7). Tyler, 6 Nov 2026: "Fixed + my own" and "Label old ones too". The
 * seven fixed types, the person's own beside them, and the one-off pass that
 * labels every hook with no type yet. A type is added the moment Add is
 * pressed; deleting one asks first, because its hooks lose their type.
 */
function HookTypesSettingsPanel() {
  const [settings, setSettingsState] = React.useState<HookTypeSettings | null>(held)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [name, setName] = React.useState("")
  const [adding, setAdding] = React.useState(false)
  const [deleting, setDeleting] = React.useState<OwnHookType | null>(null)
  const [busyDelete, setBusyDelete] = React.useState(false)
  const [labelling, setLabelling] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()

  function setSettings(next: HookTypeSettings) {
    held = next
    setSettingsState(next)
  }

  React.useEffect(() => {
    let cancelled = false
    loadHookTypeSettings().then(
      (loaded) => {
        held = loaded
        if (!cancelled) setSettingsState(loaded)
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(getViralErrorMessage(error))
      }
    )
    return () => {
      cancelled = true
    }
  }, [reloads])

  async function add() {
    const cleaned = cleanHookTypeName(name)
    if (!cleaned) {
      showErrorToast("Give the type a name.")
      return
    }
    setAdding(true)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setSettings(await addHookTypeFn(cleaned))
      setName("")
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setAdding(false)
    }
  }

  async function remove(type: OwnHookType) {
    setBusyDelete(true)
    setSaveStatus("saving")
    try {
      setSettings(await deleteHookTypeFn(type.id))
      setDeleting(null)
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusyDelete(false)
    }
  }

  async function label() {
    setLabelling(true)
    dismissErrorToast()
    try {
      const { result, settings: next } = await labelOldHooksFn()
      setSettings(next)
      if (result.error) {
        // Worded the way every Viral error is, so a bare code or a raw failure never reaches the screen.
        const why = getViralErrorMessage(result.error)
        showErrorToast(
          result.labelled ? `${result.labelled} ${plural(result.labelled, "hook")} labelled, then a call failed: ${why}` : why
        )
      }
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setLabelling(false)
    }
  }

  if (loadError) {
    return (
      <ErrorRow
        message={loadError}
        onRetry={() => {
          setLoadError(null)
          setReloads((count) => count + 1)
        }}
      />
    )
  }
  if (!settings) return <LoadingRow label="Reading the hook types…" />

  const priceLine = writerPriceWords(settings.price)

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="viral-hook-types"
        title="Hook types"
        description="The types the Library sorts hooks into. Every new analysis names its hook's type from this list at no extra cost."
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-sm font-medium">Fixed</p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Fixed hook types">
              {FIXED_HOOK_TYPES.map((type) => (
                <li key={type.id}>
                  <Badge variant="secondary">{type.label}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-2">
            <p className="text-sm font-medium">Your own</p>
            {settings.own.length ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="Your own hook types">
                {settings.own.map((type) => (
                  <li key={type.id} className="flex h-7 items-center gap-1 rounded-md border bg-muted/40 pl-2 text-sm">
                    {type.name}
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Delete ${type.name}`} onClick={() => setDeleting(type)}>
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None yet. Add a kind of hook you look out for, such as "Callback".</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="viral-hook-type-new">Add a type</Label>
            <div className="flex gap-2">
              <Input
                id="viral-hook-type-new"
                value={name}
                maxLength={HOOK_TYPE_NAME_MAX}
                placeholder="Callback"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void add()
                  }
                }}
              />
              <Button type="button" variant="outline" disabled={adding} onClick={() => void add()}>
                {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                Add
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="viral-hook-types-label"
        title="Label old hooks"
        description="A one-off pass for hooks in the Library that have no type yet: ones analysed before types existed, and your own hooks saved with No type. The AI reads each hook's words and picks a type from the list above."
      >
        {settings.unlabelled ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {settings.unlabelled} {plural(settings.unlabelled, "hook has", "hooks have")} no type.{" "}
              {settings.nextPress < settings.unlabelled ? `One press labels the next ${settings.nextPress}, ` : "Labelling them costs "}
              {priceLine}.
            </p>
            <div>
              <Button type="button" disabled={labelling} onClick={() => void label()}>
                {labelling ? <Loader2Icon className="animate-spin" /> : <TagsIcon />}
                Label {settings.nextPress} {plural(settings.nextPress, "hook")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Every hook in the Library has a type.</p>
        )}
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="The hooks of this type go back to no type. Saved views that filter by it open without it."
        confirmLabel="Delete type"
        loading={busyDelete}
        onConfirm={() => {
          if (deleting) void remove(deleting)
        }}
      />
    </CardGroup>
  )
}

export default HookTypesSettingsPanel
