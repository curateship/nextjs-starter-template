"use client"

import { useState } from "react"
import GripVertical from "lucide-react/dist/esm/icons/grip-vertical.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type {
  DirectoryCustomBlockField,
  DirectoryCustomBlockLayout,
  DirectoryCustomBlockRepeaterField,
  DirectoryCustomBlockSimpleFieldType,
} from "@/lib/actions/directories/directory-custom-blocks/types"
import { createDirectoryCustomFieldOption, createDirectoryCustomRepeaterField } from "@/lib/actions/directories/directory-custom-blocks/utils"
import { useSortableRow } from "@/components/admin/layout/builder/use-sortable-row"

interface DirectoryCustomBlockSettingsPanelProps {
  name: string
  layout: DirectoryCustomBlockLayout
  selectedField: DirectoryCustomBlockField | null
  onNameChange: (value: string) => void
  onLayoutChange: (value: DirectoryCustomBlockLayout) => void
  onFieldChange: (field: DirectoryCustomBlockField) => void
}

const REPEATER_FIELD_TYPE_OPTIONS: Array<{ value: DirectoryCustomBlockSimpleFieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'rich-text', label: 'Rich Text' },
  { value: 'image', label: 'Image' },
  { value: 'link', label: 'Link' },
  { value: 'number', label: 'Number' },
  { value: 'tags', label: 'Tags' },
  { value: 'select', label: 'Select' },
]

export function DirectoryCustomBlockSettingsPanel({
  name,
  layout,
  selectedField,
  onNameChange,
  onLayoutChange,
  onFieldChange,
}: DirectoryCustomBlockSettingsPanelProps) {
  const [repeaterFieldType, setRepeaterFieldType] = useState<DirectoryCustomBlockSimpleFieldType>('text')
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  if (!selectedField) {
    return (
      <div className="w-[324px] border-l bg-background overflow-y-auto">
        <div className="space-y-6 px-6 py-6">
          <div className="space-y-4">
            <h3 className="text-base font-medium">Block Settings</h3>
            <Field>
              <FieldLabel htmlFor="custom-block-name">Block Name</FieldLabel>
              <Input
                id="custom-block-name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Business Info"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="custom-block-layout">Layout</FieldLabel>
              <Select value={layout} onValueChange={(value) => onLayoutChange(value as DirectoryCustomBlockLayout)}>
                <SelectTrigger id="custom-block-layout">
                  <SelectValue placeholder="Choose layout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stack">Stack</SelectItem>
                  <SelectItem value="stack-card">Stack Card</SelectItem>
                  <SelectItem value="two-column">Two Column</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <h3 className="text-base font-medium text-foreground">How It Works</h3>
            <p>Add fields from the left panel.</p>
            <p>Select a field to edit its label, type-specific settings, and column placement.</p>
            <p>In the directory builder, this custom block will appear under the Custom section in Add Blocks.</p>
          </div>
        </div>
      </div>
    )
  }

  const updateSelectedField = (updates: Partial<DirectoryCustomBlockField>) => {
    onFieldChange({
      ...selectedField,
      ...updates,
    })
  }

  const fieldLabelId = `custom-block-field-label-${selectedField.id}`
  const fieldPlaceholderId = `custom-block-field-placeholder-${selectedField.id}`
  const fieldColumnId = `custom-block-field-column-${selectedField.id}`
  const repeaterFieldTypeId = `custom-block-repeater-type-${selectedField.id}`

  const handleRepeaterDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const currentFields = selectedField.fields || []
    const oldIndex = currentFields.findIndex(field => field.id === active.id)
    const newIndex = currentFields.findIndex(field => field.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    updateSelectedField({ fields: arrayMove(currentFields, oldIndex, newIndex) })
  }

  return (
    <div className="w-[324px] border-l bg-background overflow-y-auto">
      <div className="space-y-6 px-6 py-6">
        <div className="space-y-4">
          <h3 className="text-base font-medium">{selectedField.label || 'Field Settings'}</h3>

          <Field>
            <FieldLabel htmlFor={fieldLabelId}>Label</FieldLabel>
            <Input
              id={fieldLabelId}
              value={selectedField.label}
              onChange={(event) => updateSelectedField({ label: event.target.value })}
              placeholder="Phone"
            />
          </Field>

          {selectedField.type !== 'toggle' && selectedField.type !== 'image' && selectedField.type !== 'repeater' && (
            <Field>
              <FieldLabel htmlFor={fieldPlaceholderId}>Placeholder</FieldLabel>
              <Input
                id={fieldPlaceholderId}
                value={selectedField.placeholder || ''}
                onChange={(event) => updateSelectedField({ placeholder: event.target.value })}
                placeholder="Optional helper text"
              />
            </Field>
          )}

          {layout === 'two-column' && (
            <Field>
              <FieldLabel htmlFor={fieldColumnId}>Column</FieldLabel>
              <Select
                value={selectedField.column || 'left'}
                onValueChange={(value) => updateSelectedField({ column: value as 'left' | 'right' })}
              >
                <SelectTrigger id={fieldColumnId}>
                  <SelectValue placeholder="Choose column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>

        {selectedField.type === 'select' && (
          <FieldOptionsEditor
            options={selectedField.options || []}
            onChange={(options) => updateSelectedField({ options })}
          />
        )}

        {selectedField.type === 'repeater' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-medium">Repeater Fields</h3>
              <p className="text-sm text-muted-foreground">Define the fields for each repeater row.</p>
            </div>

            <div className="flex gap-2">
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor={repeaterFieldTypeId}>Field Type</FieldLabel>
                <Select value={repeaterFieldType} onValueChange={(value) => setRepeaterFieldType(value as DirectoryCustomBlockSimpleFieldType)}>
                  <SelectTrigger id={repeaterFieldTypeId}>
                    <SelectValue placeholder="Field type" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPEATER_FIELD_TYPE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button
                type="button"
                variant="outline"
                className="mt-6"
                onClick={() => updateSelectedField({ fields: [...(selectedField.fields || []), createDirectoryCustomRepeaterField(repeaterFieldType)] })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>

            {(selectedField.fields || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Add sub-fields to define each repeater row.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRepeaterDragEnd}>
                <SortableContext
                  items={(selectedField.fields || []).map(field => field.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {(selectedField.fields || []).map((field, index) => (
                      <SortableRepeaterFieldEditor
                        key={field.id}
                        field={field}
                        onChange={(nextField) => {
                          const nextFields = [...(selectedField.fields || [])]
                          nextFields[index] = nextField
                          updateSelectedField({ fields: nextFields })
                        }}
                        onDelete={() => {
                          const nextFields = (selectedField.fields || []).filter(item => item.id !== field.id)
                          updateSelectedField({ fields: nextFields })
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FieldOptionsEditor({
  options,
  onChange,
}: {
  options: NonNullable<DirectoryCustomBlockField['options']>
  onChange: (options: DirectoryCustomBlockField['options']) => void
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-medium">Select Options</h3>

      {options.map((option, index) => (
        <div key={option.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="grid flex-1 gap-3">
              <Field>
                <FieldLabel htmlFor={`field-option-label-${option.id}`}>Label</FieldLabel>
                <Input
                  id={`field-option-label-${option.id}`}
                  value={option.label}
                  onChange={(event) => {
                    const next = [...options]
                    next[index] = { ...option, label: event.target.value }
                    onChange(next)
                  }}
                  placeholder="Option label"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`field-option-value-${option.id}`}>Value</FieldLabel>
                <Input
                  id={`field-option-value-${option.id}`}
                  value={option.value}
                  onChange={(event) => {
                    const next = [...options]
                    next[index] = { ...option, value: event.target.value }
                    onChange(next)
                  }}
                  placeholder="option-value"
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(options.filter(item => item.id !== option.id))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...(options || []), createDirectoryCustomFieldOption()])}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Option
      </Button>
    </div>
  )
}

function SortableRepeaterFieldEditor({
  field,
  onChange,
  onDelete,
}: {
  field: DirectoryCustomBlockRepeaterField
  onChange: (field: DirectoryCustomBlockRepeaterField) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style, isDragging } = useSortableRow(field.id)
  const repeaterLabelId = `repeater-field-label-${field.id}`
  const repeaterPlaceholderId = `repeater-field-placeholder-${field.id}`

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border bg-background p-4 transition-colors hover:border-muted-foreground"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            {...attributes}
            {...listeners}
            className="h-8 w-8 cursor-grab text-muted-foreground opacity-60 transition-opacity hover:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{field.type}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Field>
          <FieldLabel htmlFor={repeaterLabelId}>Label</FieldLabel>
          <Input
            id={repeaterLabelId}
            value={field.label}
            onChange={(event) => onChange({ ...field, label: event.target.value })}
            placeholder="Feature title"
          />
        </Field>

        {field.type !== 'toggle' && field.type !== 'image' && (
          <Field>
            <FieldLabel htmlFor={repeaterPlaceholderId}>Placeholder</FieldLabel>
            <Input
              id={repeaterPlaceholderId}
              value={field.placeholder || ''}
              onChange={(event) => onChange({ ...field, placeholder: event.target.value })}
              placeholder="Optional helper text"
            />
          </Field>
        )}

        {field.type === 'select' && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Options</p>
            {(field.options || []).map((option, optionIndex) => (
              <div key={option.id} className="grid gap-3 rounded-lg border p-3">
                <Input
                  value={option.label}
                  onChange={(event) => {
                    const nextOptions = [...(field.options || [])]
                    nextOptions[optionIndex] = { ...option, label: event.target.value }
                    onChange({ ...field, options: nextOptions })
                  }}
                  placeholder="Option label"
                />
                <Input
                  value={option.value}
                  onChange={(event) => {
                    const nextOptions = [...(field.options || [])]
                    nextOptions[optionIndex] = { ...option, value: event.target.value }
                    onChange({ ...field, options: nextOptions })
                  }}
                  placeholder="Option value"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-start px-0"
                  onClick={() => onChange({ ...field, options: (field.options || []).filter(item => item.id !== option.id) })}
                >
                  Remove option
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() => onChange({ ...field, options: [...(field.options || []), createDirectoryCustomFieldOption()] })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Option
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
