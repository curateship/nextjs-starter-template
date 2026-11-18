import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, ListPlusIcon, PlusIcon, TextCursorInputIcon, Trash2Icon } from "lucide-react"

import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { FieldRow, fieldsSnapshot, newField } from "@/components/directory/custom-section-fields"
import {
  AutoSaveWords,
  PickGroup,
  RecordMenu,
  useAutoSave,
  useOpenFirstRow,
  type SectionProps,
} from "@/components/directory/listings-dashboard/section-parts"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { PickMenuRow } from "@/components/shared/notes/pick-rows"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { TableCell } from "@/components/ui/table"
import {
  getCustomSectionErrorMessage,
  loadCustomFieldsRemovalImpact,
  loadCustomSectionDeleteImpact,
  removeCustomSection,
  saveCustomSection,
  saveCustomSectionOrder,
  saveNewCustomSection,
  type CustomSectionSummary,
} from "@/lib/api/directory/custom-sections"
import {
  CUSTOM_SECTION_LAYOUT_LABELS,
  CUSTOM_SECTION_LAYOUTS,
  CUSTOM_SECTION_NAME_MAX,
  MAX_CUSTOM_FIELDS_PER_SECTION,
  MAX_CUSTOM_SECTIONS,
  type CustomField,
  type CustomSectionLayout,
} from "@/lib/directory/custom-fields"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Custom fields row: the sections of fields a site invents for its
 * listings, in the order they sit on a listing's page. It was the Listing
 * fields page, whose rows opened a window with Save.
 *
 * - **Header:** "N selected" (Delete), search, Select, New section. At the
 *   most a site may have, New section still opens, and says so (Tyler's
 *   polish pick, 18 Nov 2026: "At 12 sections the New button stays live").
 * - **Rows:** the cog and the bin. The order is the page's, so the columns
 *   do not sort; a row moves with Move up and Move down in its right-click
 *   menu and its ⋮, beside Mass select, Duplicate and Delete.
 * - **Right:** the open section, its name, arrangement and fields, saving by
 *   themselves. Removing a field listings have filled in asks first.
 */
export function FieldsSection({ data, search, frame, onChanged }: SectionProps<CustomSectionSummary[]>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return data
    return data.filter((section) =>
      `${section.name} ${section.fields.map((field) => field.label).join(" ")}`.toLowerCase().includes(needle)
    )
  }, [data, q])
  const ids = rows.map((section) => section.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openSection = data.find((section) => section.id === openId) ?? null

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [confirm, setConfirm] = React.useState<{ sections: CustomSectionSummary[]; listings: number } | null>(null)
  const [run, busy] = useAsyncAction(getCustomSectionErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()
  useClearSelectionOnListChange(selection.setSelected, q)

  const full = data.length >= MAX_CUSTOM_SECTIONS

  const move = (section: CustomSectionSummary, by: -1 | 1) => {
    const order = data.map((each) => each.id)
    const index = order.indexOf(section.id)
    const next = index + by
    if (index < 0 || next < 0 || next >= order.length) return
    order.splice(index, 1)
    order.splice(next, 0, section.id)
    void run(async () => {
      await saveCustomSectionOrder(order)
      await onChanged()
    })
  }

  /** A copy below the last: the same fields, a free name. It opens on the right. */
  const duplicate = (section: CustomSectionSummary) =>
    void run(async () => {
      if (full) throw new Error(`A site can have ${MAX_CUSTOM_SECTIONS} sections. Delete one to add another.`)
      const made = await saveNewCustomSection({ name: `${section.name} copy`.slice(0, CUSTOM_SECTION_NAME_MAX), layout: section.layout })
      await saveCustomSection({
        id: made.id,
        // A field the server files under a new key, so the copy's answers never mix with the original's.
        fields: section.fields.map((field) => ({ ...field, key: "" })),
      })
      await onChanged()
      setOpen(made.id)
    })

  const askToDelete = (list: CustomSectionSummary[]) =>
    void run(async () => {
      const impacts = await Promise.all(list.map((section) => loadCustomSectionDeleteImpact(section.slug)))
      setConfirm({ sections: list, listings: impacts.reduce((sum, impact) => sum + impact.listings, 0) })
    })

  const actionsFor = (section: CustomSectionSummary): RowMenuItem[] => {
    const index = data.findIndex((each) => each.id === section.id)
    return [
      ...(index > 0 ? [{ label: "Move up", icon: <ArrowUpIcon className="size-4" />, onSelect: () => move(section, -1) }] : []),
      ...(index < data.length - 1
        ? [{ label: "Move down", icon: <ArrowDownIcon className="size-4" />, onSelect: () => move(section, 1) }]
        : []),
      { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => duplicate(section) },
      { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => askToDelete([section]) },
    ]
  }

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }
  const ticked = data.filter((section) => selection.selected.has(section.id))
  const rightClicked = rightClick ? data.find((section) => section.id === rightClick.id) : undefined

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={ListPlusIcon} label="Custom fields" />}
        end={<PanelReopenButton side="right" label="Show the section" />}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <SelectedMenuRow
                  className="text-destructive"
                  onClick={() => {
                    menu.close()
                    askToDelete(ticked)
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for custom fields"
        search={{
          name: "custom-field-search",
          label: "Search sections and their fields",
          placeholder: "Search fields",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        primary={
          <NewSectionDropdown
            full={full}
            onCreated={async (id) => {
              await onChanged()
              setOpen(id)
            }}
          />
        }
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Section", column: "main", className: "min-w-40", sortable: false },
          { key: "fields", label: "Fields", column: "meta", sortable: false },
          { key: "layout", label: "Arrangement", column: "meta", className: "hidden md:hidden @2xl:table-cell", sortable: false },
          { key: "listings", label: "Filled in on", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? { noun: "sections", disabled: ids.length === 0, checked: selection.selectAllState(ids), onToggle: () => selection.toggleVisible(ids) }
            : null
        }
        empty={
          rows.length > 0 ? null : q.trim() ? (
            <span className="grid justify-items-center gap-2">
              {`No sections match "${q.trim()}".`}
              <Button type="button" variant="outline" size="sm" onClick={() => setListSearch({ q: undefined })}>
                Clear filters
              </Button>
            </span>
          ) : (
            "No sections yet. A section is a heading of extra fields every listing can fill in. Make one with New section."
          )
        }
      >
        {rows.map((section) => (
          <CrmTableRow
            key={section.id}
            open={section.id === openId}
            label={section.name}
            tick={{ shown: massSelect, ticked: selection.selected.has(section.id), onToggle: () => selection.toggle(section.id) }}
            onOpen={() => {
              setPressedId(section.id)
              setOpen(section.id)
            }}
            onDelete={() => askToDelete([section])}
            onRightClick={(x, y) => setRightClick({ id: section.id, x, y })}
          >
            <MainCell name={section.name} line={section.fields.map((field) => field.label).join(" · ") || "No fields yet"} />
            <TableCell column="mutedMeta" className="tabular-nums">
              {section.fields.length}
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @2xl:table-cell">
              <Chip muted>{CUSTOM_SECTION_LAYOUT_LABELS[section.layout]}</Chip>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @xl:table-cell">
              {section.listings.toLocaleString()} {plural(section.listings, "listing", "listings")}
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={actionsFor(rightClicked)}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: q,
    showRightFor: pressedId && pressedId === openId ? pressedId : undefined,
    middle,
    right: {
      label: "Section",
      showLabel: "Show the section",
      content: openSection ? (
        <SectionRecord
          key={openSection.id}
          section={openSection}
          actions={actionsFor(openSection)}
          busy={busy}
          onSaved={() => void onChanged()}
        />
      ) : (
        <EmptyRecord
          title="Section"
          icon={<ListPlusIcon aria-hidden />}
          line={data.length ? "Click a section to see it here." : "Make a section with New section to see it here."}
          hideLabel="Hide the section"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={confirm && confirm.sections.length > 1 ? `Delete ${confirm.sections.length} sections?` : "Delete this section?"}
        description={
          confirm
            ? [
                confirm.sections.length === 1
                  ? `${confirm.sections[0]!.name} and its fields go for good.`
                  : `${confirm.sections.length} sections and their fields go for good.`,
                confirm.listings
                  ? `${confirm.listings} ${plural(confirm.listings, "listing loses", "listings lose")} what was filled in.`
                  : null,
              ]
                .filter(Boolean)
                .join(" ")
            : null
        }
        confirmLabel={confirm && confirm.sections.length > 1 ? `Delete ${confirm.sections.length} sections` : "Delete section"}
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!confirm) return
            // One that fails does not stop the rest, and stays ticked
            // (`workspace/docs/changing-many-records.md`).
            const asked = confirm.sections
            const kept: typeof asked = []
            let reason: unknown
            for (const section of asked) {
              try {
                await removeCustomSection(section.id)
              } catch (error) {
                kept.push(section)
                reason ??= error
              }
            }
            selection.setSelected(new Set(kept.map((each) => each.id)))
            setConfirm(null)
            await onChanged()
            if (kept.length === asked.length) throw reason
            if (kept.length) {
              throw new Error(
                `${asked.length - kept.length} of ${asked.length} deleted. ${kept.map((each) => each.name).join(", ")} could not be, and ${kept.length === 1 ? "stays" : "stay"} ticked.`
              )
            }
          })
        }
      />
    ),
  })
}

/**
 * New section: a name, as a dropdown under its button. At the most a site
 * may have it still opens, and says why nothing more can be made, rather than
 * a greyed button that says nothing (Tyler's polish pick, 18 Nov 2026).
 */
function NewSectionDropdown({ full, onCreated }: { full: boolean; onCreated: (id: string) => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [run, saving] = useAsyncAction(getCustomSectionErrorMessage)
  return (
    <NewRecordDropdown
      label="New section"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create section"
      busy={saving}
      onSubmit={() =>
        void run(async () => {
          if (full) throw new Error(`A site can have ${MAX_CUSTOM_SECTIONS} sections. Delete one to add another.`)
          if (!name.trim()) throw new Error("A section needs a name.")
          const made = await saveNewCustomSection({ name: name.trim() })
          setName("")
          setOpen(false)
          await onCreated(made.id)
        })
      }
      trigger={
        <DashboardToolbarButton type="button" aria-label="New section">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:sr-only">New section</span>
        </DashboardToolbarButton>
      }
    >
      {full ? (
        <p className="text-sm">
          A site can have {MAX_CUSTOM_SECTIONS} sections. Delete one to add another.
        </p>
      ) : (
        <div className="grid gap-2">
          <FieldLabel htmlFor="new-section-name" hint="The heading its fields sit under on a listing's page.">
            Name
          </FieldLabel>
          <Input
            id="new-section-name"
            autoFocus
            maxLength={CUSTOM_SECTION_NAME_MAX}
            placeholder="The wine"
            value={name}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      )}
    </NewRecordDropdown>
  )
}

/** One section on the right: its name and fields, saving by themselves; its arrangement in the ⋮. */
function SectionRecord({
  section,
  actions,
  busy,
  onSaved,
}: {
  section: CustomSectionSummary
  actions: RowMenuItem[]
  busy: boolean
  onSaved: () => void
}) {
  const [name, setName] = React.useState(section.name)
  const [layout, setLayout] = React.useState<CustomSectionLayout>(section.layout)
  const [fields, setFields] = React.useState<CustomField[]>(section.fields)
  const [dropping, setDropping] = React.useState<{ field: CustomField; listings: number } | null>(null)
  const unnamed = fields.some((field) => !field.label.trim())
  const ready = name.trim().length > 0 && !unnamed
  const auto = useAutoSave({
    // Compared through the saved shape, so a fresh id on an unsaved field is not an edit.
    value: { name, layout, fields },
    ready,
    message: getCustomSectionErrorMessage,
    save: async (next) => {
      const saved = await saveCustomSection({ id: section.id, ...next })
      // The server files new fields under keys; take them, so the next save keeps them.
      if (fieldsSnapshot(saved.fields) !== fieldsSnapshot(next.fields)) setFields(saved.fields)
      onSaved()
    },
  })

  const update = (id: string, patch: Partial<CustomField>) =>
    setFields((current) => current.map((field) => (field.id === id ? ({ ...field, ...patch } as CustomField) : field)))
  const moveField = (id: string, by: -1 | 1) =>
    setFields((current) => {
      const index = current.findIndex((field) => field.id === id)
      const next = index + by
      if (index === -1 || next < 0 || next >= current.length) return current
      const reordered = [...current]
      const [moved] = reordered.splice(index, 1)
      reordered.splice(next, 0, moved!)
      return reordered
    })

  /** Removing a field listings have filled in asks first; one nobody used goes at once. */
  const askToRemove = async (field: CustomField) => {
    if (!field.key) {
      setFields((current) => current.filter((each) => each.id !== field.id))
      return
    }
    try {
      const { removed } = await loadCustomFieldsRemovalImpact(
        section.id,
        fields.filter((each) => each.id !== field.id)
      )
      const listings = removed.reduce((sum, entry) => sum + entry.listings, 0)
      if (listings) setDropping({ field, listings })
      else setFields((current) => current.filter((each) => each.id !== field.id))
    } catch (error) {
      showErrorToast(getCustomSectionErrorMessage(error))
    }
  }

  const full = fields.length >= MAX_CUSTOM_FIELDS_PER_SECTION

  return (
    <>
      <RecordFrame
        avatar={<ListPlusIcon aria-hidden />}
        title={name.trim() || "Untitled section"}
        line={`${fields.length} ${plural(fields.length, "field", "fields")}`}
        hideLabel="Hide the section"
        actions={
          <RecordMenu
            label="Section menu"
            groups={
              <PickGroup title="Section">
                <PickMenuRow
                  label="Arrangement"
                  value={CUSTOM_SECTION_LAYOUT_LABELS[layout]}
                  options={CUSTOM_SECTION_LAYOUTS.map((value) => ({ value, label: CUSTOM_SECTION_LAYOUT_LABELS[value] }))}
                  selected={layout}
                  onPick={(value) => setLayout(value as CustomSectionLayout)}
                />
              </PickGroup>
            }
            actions={actions.map((action) => ({ ...action, disabled: busy }))}
          />
        }
        body={
          <>
            <PanelCard storageId="custom-section-basics" icon={<ListPlusIcon />} title="The section" openWhen={!name.trim()}>
              <div className="grid gap-2">
                <FieldLabel htmlFor="custom-section-name" hint="The heading its fields sit under on a listing's page.">
                  Name
                </FieldLabel>
                <Input
                  id="custom-section-name"
                  value={name}
                  maxLength={CUSTOM_SECTION_NAME_MAX}
                  aria-invalid={!name.trim()}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            </PanelCard>
            <PanelCard storageId="custom-section-fields" icon={<TextCursorInputIcon />} title="Fields" meta={fields.length || undefined} openWhen={unnamed}>
              <div className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  {fields.length ? "A listing shows only the ones it has filled in." : "No fields yet. Add the first one."}
                </p>
                {fields.map((field, index) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    index={index}
                    count={fields.length}
                    disabled={false}
                    onChange={(patch) => update(field.id, patch)}
                    onMove={(by) => moveField(field.id, by)}
                    onRemove={() => void askToRemove(field)}
                  />
                ))}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (full) {
                        showErrorToast(`A section holds ${MAX_CUSTOM_FIELDS_PER_SECTION} fields. Remove one to add another.`)
                        return
                      }
                      setFields((current) => [...current, newField()])
                    }}
                  >
                    <PlusIcon className="size-4" />
                    Add field
                  </Button>
                </div>
              </div>
            </PanelCard>
          </>
        }
        footer={
          <>
            <FooterState>
              <AutoSaveWords
                state={auto.state}
                ready={ready}
                why={!name.trim() ? "Give it a name to save" : "Name every field to save"}
              />
            </FooterState>
            <span className="text-sm text-muted-foreground">
              Filled in on {section.listings.toLocaleString()} {plural(section.listings, "listing", "listings")}
            </span>
          </>
        }
      />
      <ConfirmDialog
        open={dropping !== null}
        onOpenChange={(open) => {
          if (!open) setDropping(null)
        }}
        title="Throw these answers away?"
        description={
          dropping
            ? `Removing ${dropping.field.label || "this field"} takes away what ${dropping.listings} ${plural(dropping.listings, "listing", "listings")} typed in for it.`
            : null
        }
        confirmLabel="Remove the field"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          if (dropping) setFields((current) => current.filter((each) => each.id !== dropping.field.id))
          setDropping(null)
        }}
      />
    </>
  )
}
