import * as React from "react"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { StrategyConfigFields } from "@/components/strategies/strategy-config-fields"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  deleteStrategyTemplate,
  saveStrategySettings,
  saveStrategyTemplate,
  type FixedStrategyItem,
  type StrategyTemplateListItem,
} from "@/lib/api/strategies"
import type { SignalStrategyConfig } from "@/lib/strategies/strategy-config"
import { cn } from "@/lib/utils"

export function StrategySettingsDialog({
  open,
  strategy,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  strategy: FixedStrategyItem | null
  onOpenChange: (open: boolean) => void
  onChanged: (strategy: FixedStrategyItem) => void
}) {
  if (!open || !strategy) return null
  return (
    <StrategySettingsDialogContent
      key={strategy.type}
      open={open}
      strategy={strategy}
      onOpenChange={onOpenChange}
      onChanged={onChanged}
    />
  )
}

function StrategySettingsDialogContent({
  open,
  strategy,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  strategy: FixedStrategyItem
  onOpenChange: (open: boolean) => void
  onChanged: (strategy: FixedStrategyItem) => void
}) {
  const [tab, setTab] = React.useState("settings")
  const [settings, setSettings] = React.useState<SignalStrategyConfig>(
    strategy.config
  )
  const [templates, setTemplates] = React.useState<
    StrategyTemplateListItem[]
  >(strategy.templates)
  const [templateId, setTemplateId] = React.useState<string | null>(null)
  const [templateName, setTemplateName] = React.useState("")
  const [templateConfig, setTemplateConfig] =
    React.useState<SignalStrategyConfig | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const currentStrategy = strategy
  const currentSettings = settings

  const selectTemplate = (template: StrategyTemplateListItem) => {
    setTemplateId(template.id)
    setTemplateName(template.name)
    setTemplateConfig(template.config)
    setError(null)
  }

  const newTemplate = () => {
    setTemplateId(null)
    setTemplateName(`${currentStrategy.label} template`)
    setTemplateConfig(currentSettings)
    setTab("templates")
    setError(null)
  }

  async function saveSettings() {
    setBusy(true)
    setError(null)
    try {
      const result = await saveStrategySettings({
        strategyType: currentStrategy.type,
        config: currentSettings,
        pinned: currentStrategy.pinned,
      })
      onChanged({ ...currentStrategy, config: result.config, templates })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving settings failed")
    } finally {
      setBusy(false)
    }
  }

  async function saveTemplate() {
    if (!templateConfig || !templateName.trim()) {
      setError("Give the template a name.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { template } = await saveStrategyTemplate({
        strategyId: templateId ?? undefined,
        name: templateName.trim(),
        config: templateConfig,
      })
      const next = templateId
        ? templates.map((item) => (item.id === template.id ? template : item))
        : [template, ...templates]
      setTemplates(next)
      selectTemplate(template)
      onChanged({ ...currentStrategy, config: currentSettings, templates: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving template failed")
    } finally {
      setBusy(false)
    }
  }

  async function removeTemplate() {
    if (!templateId) return
    setBusy(true)
    setError(null)
    try {
      await deleteStrategyTemplate(templateId)
      const next = templates.filter((item) => item.id !== templateId)
      setTemplates(next)
      setTemplateId(null)
      setTemplateName("")
      setTemplateConfig(null)
      onChanged({ ...currentStrategy, config: currentSettings, templates: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deleting template failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? null : onOpenChange(next))}>
      <DialogContent variant="admin">
        <Tabs value={tab} onValueChange={setTab} className="contents">
          <DialogHeader className="pr-16 sm:flex-row sm:items-center sm:gap-6">
            <div>
              <DialogTitle>{currentStrategy.label}</DialogTitle>
            </div>
            <TabsList className="grid w-full shrink-0 grid-cols-2 sm:w-64">
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="templates">
                Templates ({templates.length})
              </TabsTrigger>
            </TabsList>
          </DialogHeader>
          <DialogBody>
            <TabsContent value="settings">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Default settings</CardTitle>
                  <CardDescription>
                    These settings are the starting point for this strategy.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <StrategyConfigFields
                    value={currentSettings}
                    lockedType={currentStrategy.type}
                    onChange={(config) =>
                      config.kind === "signal" ? setSettings(config) : undefined
                    }
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="templates">
              <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Saved templates</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      onClick={newTemplate}
                    >
                      <PlusIcon className="size-3.5" />
                      New template
                    </Button>
                    {templates.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No templates saved yet.
                      </p>
                    ) : (
                      templates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted/50",
                            template.id === templateId &&
                              "border-primary bg-muted"
                          )}
                          onClick={() => selectTemplate(template)}
                        >
                          {template.name}
                        </button>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>
                      {templateId ? "Edit template" : "New template"}
                    </CardTitle>
                    <CardDescription>
                      Rename it or change its individual settings.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {templateConfig ? (
                      <>
                        <div className="grid gap-1.5">
                          <Label htmlFor="strategy-template-name">Name</Label>
                          <Input
                            id="strategy-template-name"
                            className="h-8"
                            value={templateName}
                            onChange={(event) =>
                              setTemplateName(event.target.value)
                            }
                          />
                        </div>
                        <StrategyConfigFields
                          value={templateConfig}
                          lockedType={currentStrategy.type}
                          onChange={(config) =>
                            config.kind === "signal"
                              ? setTemplateConfig(config)
                              : undefined
                          }
                        />
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Select a template or create a new one.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </DialogBody>
          <DialogFooter>
            {tab === "settings" ? (
              <>
                <Button variant="outline" disabled={busy} onClick={newTemplate}>
                  Save as template
                </Button>
                <Button disabled={busy} onClick={() => void saveSettings()}>
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Save settings
                </Button>
              </>
            ) : (
              <>
                {templateId ? (
                  <Button
                    variant="outline"
                    className="mr-auto text-destructive"
                    disabled={busy}
                    onClick={() => void removeTemplate()}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </Button>
                ) : null}
                <Button
                  disabled={busy || !templateConfig}
                  onClick={() => void saveTemplate()}
                >
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  {templateId ? "Save template" : "Create template"}
                </Button>
              </>
            )}
          </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
