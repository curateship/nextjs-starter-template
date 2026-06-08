'use client'

import { GripVertical, Plus, Trash2 } from "lucide-react"
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
import { CSS } from "@dnd-kit/utilities"
import { BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { MediaInput } from "@/components/admin/media-library/MediaInput"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type {
  DirectoryCustomBlockRepeaterField,
  DirectoryCustomBlockTemplate,
} from "@/lib/actions/directories/directory-custom-blocks/types"

interface DirectoryCustomBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  template: DirectoryCustomBlockTemplate | null
  siteId: string
}

export function DirectoryCustomBlock({
  content,
  onContentChange,
  template,
  siteId,
}: DirectoryCustomBlockProps) {
  const values = content.values && typeof content.values === 'object' ? content.values : {}

  if (!template) {
    return (
      <BlockTabs
        headerClassName="pt-0"
        tabs={[
          {
            value: 'content',
            label: 'Content',
            content: (
              <CardGroup className="grid">
                <Card>
                  <CardHeader>
                    <DashboardModalCardTitle>Custom Block Missing</DashboardModalCardTitle>
                  </CardHeader>
                  <CardContent className="gap-3 text-sm text-muted-foreground">
                    <p>This directory block references a custom block template that could not be found.</p>
                    <p>Create or restore the template before editing this block again.</p>
                  </CardContent>
                </Card>
              </CardGroup>
            ),
          },
        ]}
      />
    )
  }

  return (
    <BlockTabs
      headerClassName="pt-0"
      tabs={[
        {
          value: 'content',
          label: 'Content',
          content: (
            <div className="grid gap-4">
              {template.fields.length === 0 ? (
                <Card>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      This custom block has no fields yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <DirectoryCustomValuesEditor
                  fields={template.fields}
                  values={values}
                  siteId={siteId}
                  onChange={(nextValues) => onContentChange('values', nextValues)}
                />
              )}
            </div>
          ),
        },
      ]}
    />
  )
}

function DirectoryCustomValuesEditor({
  fields,
  values,
  siteId,
  onChange,
}: {
  fields: DirectoryCustomBlockTemplate['fields']
  values: Record<string, any>
  siteId: string
  onChange: (values: Record<string, any>) => void
}) {
  const updateValue = (fieldKey: string, value: any) => {
    onChange({
      ...values,
      [fieldKey]: value,
    })
  }

  return (
    <CardGroup className="grid">
      {fields.map(field => {
        const value = values[field.key]

        if (field.type === 'text') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <FieldLabel>{field.label || 'Text'}</FieldLabel>
                  <Input
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder={field.placeholder || ''}
                  />
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'textarea') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <FieldLabel>{field.label || 'Textarea'}</FieldLabel>
                  <Textarea
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder={field.placeholder || ''}
                  />
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'number') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <FieldLabel>{field.label || 'Number'}</FieldLabel>
                  <Input
                    type="number"
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder={field.placeholder || ''}
                  />
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'link') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <FieldLabel>{field.label || 'Link'}</FieldLabel>
                  <Input
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder={field.placeholder || 'https://example.com'}
                  />
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'toggle') {
          return (
            <Card key={field.id}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{field.label || 'Toggle'}</span>
                  <Switch
                    checked={value === true}
                    onCheckedChange={(checked) => updateValue(field.key, checked === true)}
                  />
                </div>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'select') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <FieldLabel>{field.label || 'Select'}</FieldLabel>
                  <Select value={typeof value === 'string' ? value : ''} onValueChange={(nextValue) => updateValue(field.key, nextValue)}>
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder || 'Choose an option'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options || []).map(option => (
                        <SelectItem key={option.id} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'image') {
          return (
            <Card key={field.id}>
              <CardContent>
                <MediaInput
                  label={field.label || 'Image'}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(nextValue) => updateValue(field.key, nextValue)}
                  siteId={siteId}
                  acceptVideo={false}
                />
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'rich-text') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <InlineRichTextEditor
                    blockId={`custom-field-${field.id}`}
                    content={{
                      htmlContent: typeof value === 'string' ? value : '',
                    }}
                    onContentChange={(htmlContent) => updateValue(field.key, htmlContent)}
                    siteId={siteId}
                    isActive
                    editorPadding={0}
                    variant="directory"
                    placeholder={field.placeholder || 'Start writing...'}
                  />
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'repeater') {
          return (
            <Card key={field.id}>
              <CardContent>
                <RepeaterFieldEditor
                  fieldLabel={field.label || 'Repeater'}
                  siteId={siteId}
                  rowFields={field.fields || []}
                  rows={Array.isArray(value) ? value : []}
                  onChange={(nextRows) => updateValue(field.key, nextRows)}
                />
              </CardContent>
            </Card>
          )
        }

        return null
      })}
    </CardGroup>
  )
}

function RepeaterFieldEditor({
  fieldLabel,
  siteId,
  rowFields,
  rows,
  onChange,
}: {
  fieldLabel: string
  siteId: string
  rowFields: DirectoryCustomBlockRepeaterField[]
  rows: Record<string, any>[]
  onChange: (rows: Record<string, any>[]) => void
}) {
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

  const addRow = () => {
    const nextRow: Record<string, any> = {}
    rowFields.forEach(field => {
      nextRow[field.key] = field.type === 'toggle' ? false : ''
    })
    onChange([...(rows || []), nextRow])
  }

  const rowIds = rows.map((_, index) => `row-${index}`)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = rowIds.indexOf(String(active.id))
    const newIndex = rowIds.indexOf(String(over.id))

    if (oldIndex === -1 || newIndex === -1) return

    onChange(arrayMove(rows, oldIndex, newIndex))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{fieldLabel}</p>
          <p className="text-xs text-muted-foreground">Repeatable rows</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-2 h-4 w-4" />
          Add Row
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rows added yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {rows.map((row, index) => (
                <SortableRepeaterRow
                  key={rowIds[index]}
                  rowId={rowIds[index]}
                  index={index}
                  row={row}
                  rowFields={rowFields}
                  siteId={siteId}
                  onDelete={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                  onChange={(nextRow) => {
                    const nextRows = [...rows]
                    nextRows[index] = nextRow
                    onChange(nextRows)
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

function SortableRepeaterRow({
  rowId,
  index,
  row,
  rowFields,
  siteId,
  onDelete,
  onChange,
}: {
  rowId: string
  index: number
  row: Record<string, any>
  rowFields: DirectoryCustomBlockRepeaterField[]
  siteId: string
  onDelete: () => void
  onChange: (row: Record<string, any>) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border bg-muted/20 p-4"
    >
      <div className="mb-4 flex items-center justify-between">
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
          <p className="text-sm font-medium">Row {index + 1}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <RepeaterRowFields
        fields={rowFields}
        rowId={rowId}
        row={row}
        siteId={siteId}
        onChange={onChange}
      />
    </div>
  )
}

function RepeaterRowFields({
  fields,
  rowId,
  row,
  siteId,
  onChange,
}: {
  fields: DirectoryCustomBlockRepeaterField[]
  rowId: string
  row: Record<string, any>
  siteId: string
  onChange: (row: Record<string, any>) => void
}) {
  const updateValue = (fieldKey: string, value: any) => {
    onChange({
      ...row,
      [fieldKey]: value,
    })
  }

  return (
    <CardGroup className="grid">
      {fields.map(field => {
        const value = row[field.key]

        if (field.type === 'text') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <FieldLabel>{field.label || 'Text'}</FieldLabel>
                  <Input
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder={field.placeholder || ''}
                  />
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'textarea') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <FieldLabel>{field.label || 'Textarea'}</FieldLabel>
                  <Textarea
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder={field.placeholder || ''}
                  />
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'number') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <FieldLabel>{field.label || 'Number'}</FieldLabel>
                  <Input
                    type="number"
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder={field.placeholder || ''}
                  />
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'link') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <FieldLabel>{field.label || 'Link'}</FieldLabel>
                  <Input
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder={field.placeholder || 'https://example.com'}
                  />
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'toggle') {
          return (
            <Card key={field.id}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{field.label || 'Toggle'}</span>
                  <Switch
                    checked={value === true}
                    onCheckedChange={(checked) => updateValue(field.key, checked === true)}
                  />
                </div>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'select') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <FieldLabel>{field.label || 'Select'}</FieldLabel>
                  <Select value={typeof value === 'string' ? value : ''} onValueChange={(nextValue) => updateValue(field.key, nextValue)}>
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder || 'Choose an option'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options || []).map(option => (
                        <SelectItem key={option.id} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'image') {
          return (
            <Card key={field.id}>
              <CardContent>
                <MediaInput
                  label={field.label || 'Image'}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(nextValue) => updateValue(field.key, nextValue)}
                  siteId={siteId}
                  acceptVideo={false}
                />
              </CardContent>
            </Card>
          )
        }

        if (field.type === 'rich-text') {
          return (
            <Card key={field.id}>
              <CardContent>
                <Field>
                  <InlineRichTextEditor
                    blockId={`custom-repeater-field-${rowId}-${field.id}`}
                    content={{
                      htmlContent: typeof value === 'string' ? value : '',
                    }}
                    onContentChange={(htmlContent) => updateValue(field.key, htmlContent)}
                    siteId={siteId}
                    isActive
                    editorPadding={0}
                    variant="directory"
                    placeholder={field.placeholder || 'Start writing...'}
                  />
                </Field>
              </CardContent>
            </Card>
          )
        }

        return null
      })}
    </CardGroup>
  )
}
