"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

import { AdminCard } from "@/components/admin-card"
import { IconPickerDialog } from "@/components/icon-picker-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  fontPresets,
  isShellItem,
  renderShellIcon,
  themePresets,
  type ShellConfig,
  type ShellEntry,
  type ShellItem,
  type ShellSection,
} from "@/lib/custom-shell"

type CustomShellEditorProps = {
  config: ShellConfig
  onChange: React.Dispatch<React.SetStateAction<ShellConfig>>
  onReset: () => void
  mode?: "all" | "appearance" | "sidebar"
}

type IconTarget = {
  sectionId: string
  entryId: string
} | null

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items]
  const [item] = next.splice(from, 1)

  if (!item) {
    return next
  }

  next.splice(to, 0, item)
  return next
}

export function CustomShellEditor({
  config,
  onChange,
  onReset,
  mode = "all",
}: CustomShellEditorProps) {
  const [iconTarget, setIconTarget] = React.useState<IconTarget>(null)
  const showAppearance = mode !== "sidebar"
  const showSidebarEditor = mode !== "appearance"

  const itemCount = config.sections.flatMap((section) => section.entries).filter(
    isShellItem
  )
  const visibleCount = itemCount.filter((item) => item.visible).length
  const hiddenCount = itemCount.length - visibleCount
  const dividerCount = config.sections
    .flatMap((section) => section.entries)
    .filter((entry) => !isShellItem(entry)).length

  const activeIcon =
    iconTarget &&
    getItemById(config.sections, iconTarget.sectionId, iconTarget.entryId)?.icon

  function updateSections(
    updater: (sections: ShellSection[]) => ShellSection[]
  ) {
    onChange((current) => ({
      ...current,
      sections: updater(current.sections),
    }))
  }

  function updateSection(
    sectionId: string,
    updater: (section: ShellSection) => ShellSection
  ) {
    updateSections((sections) =>
      sections.map((section) =>
        section.id === sectionId ? updater(section) : section
      )
    )
  }

  function updateEntry(
    sectionId: string,
    entryId: string,
    updater: (entry: ShellEntry) => ShellEntry
  ) {
    updateSection(sectionId, (section) => ({
      ...section,
      entries: section.entries.map((entry) =>
        entry.id === entryId ? updater(entry) : entry
      ),
    }))
  }

  function addSection() {
    updateSections((sections) => [
      ...sections,
      {
        id: createId("section"),
        title: "New Section",
        entries: [],
      },
    ])
  }

  function removeSection(sectionId: string) {
    updateSections((sections) => sections.filter((section) => section.id !== sectionId))
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    updateSections((sections) => {
      const index = sections.findIndex((section) => section.id === sectionId)
      const nextIndex = index + direction

      if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) {
        return sections
      }

      return moveItem(sections, index, nextIndex)
    })
  }

  function addItem(sectionId: string) {
    updateSection(sectionId, (section) => ({
      ...section,
      entries: [
        ...section.entries,
        {
          type: "item",
          id: createId("item"),
          label: "New Item",
          href: "/admin/new-item",
          icon: "layoutDashboard",
          visible: true,
        },
      ],
    }))
  }

  function addDivider(sectionId: string) {
    updateSection(sectionId, (section) => ({
      ...section,
      entries: [
        ...section.entries,
        {
          type: "divider",
          id: createId("divider"),
          label: "New Divider",
        },
      ],
    }))
  }

  function removeEntry(sectionId: string, entryId: string) {
    updateSection(sectionId, (section) => ({
      ...section,
      entries: section.entries.filter((entry) => entry.id !== entryId),
    }))
  }

  function moveEntry(sectionId: string, entryId: string, direction: -1 | 1) {
    updateSection(sectionId, (section) => {
      const index = section.entries.findIndex((entry) => entry.id === entryId)
      const nextIndex = index + direction

      if (index < 0 || nextIndex < 0 || nextIndex >= section.entries.length) {
        return section
      }

      return {
        ...section,
        entries: moveItem(section.entries, index, nextIndex),
      }
    })
  }

  return (
    <div className="space-y-4">
      {showAppearance ? (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <AppearanceCard config={config} onChange={onChange} />
          <SummaryCard
            config={config}
            dividerCount={dividerCount}
            hiddenCount={hiddenCount}
            onReset={onReset}
            visibleCount={visibleCount}
          />
        </div>
      ) : (
        <SummaryCard
          config={config}
          dividerCount={dividerCount}
          hiddenCount={hiddenCount}
          onReset={onReset}
          visibleCount={visibleCount}
        />
      )}

      {showSidebarEditor ? (
        <AdminCard
          title="Sidebar editor"
          description="Reorder items, add dividers, change icons, update labels, and hide entries without touching shell internals."
        >
          <div className="space-y-4">
            {config.sections.map((section, sectionIndex) => (
              <div
                key={section.id}
                className="rounded-xl border bg-background p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={section.title}
                    onChange={(event) =>
                      updateSection(section.id, (current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className="max-w-sm font-medium"
                  />
                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => moveSection(section.id, -1)}
                      disabled={sectionIndex === 0}
                    >
                      <ArrowUpIcon />
                      <span className="sr-only">Move section up</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => moveSection(section.id, 1)}
                      disabled={sectionIndex === config.sections.length - 1}
                    >
                      <ArrowDownIcon />
                      <span className="sr-only">Move section down</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addItem(section.id)}
                    >
                      <PlusIcon />
                      Add item
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addDivider(section.id)}
                    >
                      <MinusIcon />
                      Add divider
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeSection(section.id)}
                      disabled={config.sections.length === 1}
                    >
                      <Trash2Icon />
                      <span className="sr-only">Delete section</span>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {section.entries.map((entry, entryIndex) =>
                    isShellItem(entry) ? (
                      <ItemEditorRow
                        key={entry.id}
                        entry={entry}
                        onOpenIconPicker={() =>
                          setIconTarget({
                            sectionId: section.id,
                            entryId: entry.id,
                          })
                        }
                        onLabelChange={(label) =>
                          updateEntry(section.id, entry.id, (current) => {
                            if (!isShellItem(current)) {
                              return current
                            }

                            return {
                              ...current,
                              label,
                            }
                          })
                        }
                        onHrefChange={(href) =>
                          updateEntry(section.id, entry.id, (current) => {
                            if (!isShellItem(current)) {
                              return current
                            }

                            return {
                              ...current,
                              href,
                            }
                          })
                        }
                        onToggleVisible={() =>
                          updateEntry(section.id, entry.id, (current) => {
                            if (!isShellItem(current)) {
                              return current
                            }

                            return {
                              ...current,
                              visible: !current.visible,
                            }
                          })
                        }
                        onMoveUp={() => moveEntry(section.id, entry.id, -1)}
                        onMoveDown={() => moveEntry(section.id, entry.id, 1)}
                        onDelete={() => removeEntry(section.id, entry.id)}
                        disableMoveUp={entryIndex === 0}
                        disableMoveDown={entryIndex === section.entries.length - 1}
                      />
                    ) : (
                      <DividerEditorRow
                        key={entry.id}
                        label={entry.label}
                        onLabelChange={(label) =>
                          updateEntry(section.id, entry.id, (current) => {
                            if (isShellItem(current)) {
                              return current
                            }

                            return {
                              ...current,
                              label,
                            }
                          })
                        }
                        onMoveUp={() => moveEntry(section.id, entry.id, -1)}
                        onMoveDown={() => moveEntry(section.id, entry.id, 1)}
                        onDelete={() => removeEntry(section.id, entry.id)}
                        disableMoveUp={entryIndex === 0}
                        disableMoveDown={entryIndex === section.entries.length - 1}
                      />
                    )
                  )}
                </div>
              </div>
            ))}

            <div className="flex justify-start">
              <Button variant="outline" size="sm" onClick={addSection}>
                <PlusIcon />
                Add section
              </Button>
            </div>
          </div>
        </AdminCard>
      ) : null}

      <IconPickerDialog
        open={Boolean(iconTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setIconTarget(null)
          }
        }}
        value={activeIcon ?? "layoutDashboard"}
        onSelect={(icon) => {
          if (!iconTarget) {
            return
          }

          updateEntry(iconTarget.sectionId, iconTarget.entryId, (current) => {
            if (!isShellItem(current)) {
              return current
            }

            return {
              ...current,
              icon,
            }
          })
        }}
      />
    </div>
  )
}

function AppearanceCard({
  config,
  onChange,
}: {
  config: ShellConfig
  onChange: React.Dispatch<React.SetStateAction<ShellConfig>>
}) {
  return (
    <AdminCard
      title="Appearance"
      description="Switch theme and font presets for the shell with one click."
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Theme presets
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {themePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    themePreset: preset.id,
                  }))
                }
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  config.themePreset === preset.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40"
                )}
              >
                <p className="font-medium">{preset.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Font presets
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {fontPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    fontPreset: preset.id,
                  }))
                }
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  config.fontPreset === preset.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40"
                )}
              >
                <p className="font-medium">{preset.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </AdminCard>
  )
}

function SummaryCard({
  config,
  dividerCount,
  hiddenCount,
  onReset,
  visibleCount,
}: {
  config: ShellConfig
  dividerCount: number
  hiddenCount: number
  onReset: () => void
  visibleCount: number
}) {
  return (
    <AdminCard
      title="Shell summary"
      description="This editor is local-only for now. The shared shell owns the mechanics, while the consuming app owns the config."
      footer={
        <div className="flex w-full justify-end">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcwIcon />
            Reset to defaults
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryStat label="Sections" value={String(config.sections.length)} />
        <SummaryStat label="Visible items" value={String(visibleCount)} />
        <SummaryStat label="Hidden items" value={String(hiddenCount)} />
        <SummaryStat label="Dividers" value={String(dividerCount)} />
      </div>
    </AdminCard>
  )
}

function ItemEditorRow({
  entry,
  onOpenIconPicker,
  onLabelChange,
  onHrefChange,
  onToggleVisible,
  onMoveUp,
  onMoveDown,
  onDelete,
  disableMoveUp,
  disableMoveDown,
}: {
  entry: ShellItem
  onOpenIconPicker: () => void
  onLabelChange: (label: string) => void
  onHrefChange: (href: string) => void
  onToggleVisible: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  disableMoveUp: boolean
  disableMoveDown: boolean
}) {
  return (
    <div
      className={cn(
        "grid gap-2 rounded-xl border bg-card p-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.9fr)_auto]",
        !entry.visible && "opacity-65"
      )}
    >
      <button
        type="button"
        onClick={onOpenIconPicker}
        className="flex size-9 items-center justify-center rounded-lg border bg-background transition-colors hover:bg-muted"
      >
        {renderShellIcon(entry.icon)}
        <span className="sr-only">Change icon</span>
      </button>

      <Input
        value={entry.label}
        onChange={(event) => onLabelChange(event.target.value)}
        placeholder="Label"
      />

      <Input
        value={entry.href}
        onChange={(event) => onHrefChange(event.target.value)}
        placeholder="/route"
      />

      <div className="flex items-center justify-end gap-1">
        <Button
          variant={entry.visible ? "outline" : "secondary"}
          size="icon-sm"
          onClick={onToggleVisible}
          title={entry.visible ? "Hide item" : "Show item"}
        >
          {entry.visible ? <EyeIcon /> : <EyeOffIcon />}
          <span className="sr-only">Toggle visibility</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onMoveUp}
          disabled={disableMoveUp}
        >
          <ArrowUpIcon />
          <span className="sr-only">Move up</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onMoveDown}
          disabled={disableMoveDown}
        >
          <ArrowDownIcon />
          <span className="sr-only">Move down</span>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <Trash2Icon />
          <span className="sr-only">Delete item</span>
        </Button>
      </div>

      {entry.children?.length ? (
        <p className="lg:col-span-3 text-xs text-muted-foreground">
          Dropdown item with {entry.children.length} preloaded child links.
        </p>
      ) : null}
    </div>
  )
}

function DividerEditorRow({
  label,
  onLabelChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  disableMoveUp,
  disableMoveDown,
}: {
  label: string
  onLabelChange: (label: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  disableMoveUp: boolean
  disableMoveDown: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed bg-muted/30 p-3">
      <div className="inline-flex h-8 items-center rounded-md border border-dashed px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Divider
      </div>
      <Input
        value={label}
        onChange={(event) => onLabelChange(event.target.value)}
        placeholder="Divider label"
        className="max-w-sm"
      />
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onMoveUp}
          disabled={disableMoveUp}
        >
          <ArrowUpIcon />
          <span className="sr-only">Move divider up</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onMoveDown}
          disabled={disableMoveDown}
        >
          <ArrowDownIcon />
          <span className="sr-only">Move divider down</span>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <Trash2Icon />
          <span className="sr-only">Delete divider</span>
        </Button>
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function getItemById(
  sections: ShellSection[],
  sectionId: string,
  entryId: string
) {
  const section = sections.find((current) => current.id === sectionId)
  const entry = section?.entries.find((current) => current.id === entryId)

  if (!entry || !isShellItem(entry)) {
    return null
  }

  return entry
}
