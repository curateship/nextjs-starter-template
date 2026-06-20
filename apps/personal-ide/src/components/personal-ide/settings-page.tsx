import { Check, RefreshCw, Save } from "lucide-react"

import type { SettingsSaveStatus } from "@/app/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function SettingsPage({
  draftTaskTemplate,
  error,
  saveStatus,
  onDraftTaskTemplateChange,
  onResetTaskTemplate,
  onSave,
}: {
  draftTaskTemplate: string
  error: string
  saveStatus: SettingsSaveStatus
  onDraftTaskTemplateChange: (value: string) => void
  onResetTaskTemplate: () => void
  onSave: () => void | Promise<void>
}) {
  const isSaving = saveStatus === "saving"

  return (
    <div className="h-full min-h-0 overflow-auto bg-background p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure Personal IDE defaults.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "saved" ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-4" />
              Saved
            </span>
          ) : null}
          <Button type="submit" form="editor-settings-form" disabled={isSaving}>
            <Save />
            {isSaving ? "Saving" : "Save"}
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {error}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex flex-col">
          <button
            type="button"
            className="rounded-md bg-muted px-4 py-2.5 text-left text-sm font-medium text-foreground"
          >
            Task Templates
          </button>
        </nav>

        <form
          id="editor-settings-form"
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave()
          }}
        >
          <section className="rounded-lg border bg-background">
            <div className="border-b px-6 py-5">
              <h2 className="text-lg font-semibold">Task Templates</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Set the Markdown used when adding a task.
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid gap-2">
                <label htmlFor="default-task-template" className="text-sm font-medium">
                  Default add-task template
                </label>
                <Textarea
                  id="default-task-template"
                  value={draftTaskTemplate}
                  disabled={isSaving}
                  onChange={(event) => onDraftTaskTemplateChange(event.target.value)}
                  className="min-h-[320px] resize-y font-mono text-xs leading-5"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{title}}"} to insert the new task title.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={onResetTaskTemplate} disabled={isSaving}>
                  <RefreshCw />
                  Reset to default
                </Button>
              </div>
            </div>
          </section>
        </form>
      </div>
    </div>
  )
}
