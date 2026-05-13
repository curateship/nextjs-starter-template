'use client'

import { ExternalLink, GripVertical, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
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
import { RichTextEditor } from "@/components/admin/layout/builder/RichTextEditor"
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
  onBack?: () => void
}

export function DirectoryCustomBlock({
  content,
  onContentChange,
  template,
  siteId,
  onBack,
}: DirectoryCustomBlockProps) {
  const values = content.values && typeof content.values === 'object' ? content.values : {}

  if (!template) {
    return (
      <BlockTabs
        onBack={onBack}
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
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: 'content',
          label: 'Content',
          content: (
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>{template.name}</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  {template.fields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This custom block has no fields yet.
                    </p>
                  ) : (
                    <DirectoryCustomValuesEditor
                      fields={template.fields}
                      values={values}
                      siteId={siteId}
                      onChange={(nextValues) => onContentChange('values', nextValues)}
                    />
                  )}
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: 'template',
          label: 'Template',
          content: (
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Template Info</DashboardModalCardTitle>
                </CardHeader>
                <CardContent className="gap-3 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">Name:</span> {template.name}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Layout:</span> {template.layout}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Fields:</span> {template.fields.length}
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-fit">
                    <Link href={`/admin/directories/custom-blocks/${template.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Edit Template
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </CardGroup>
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
    <div className="space-y-6">
      {fields.map(field => {
        const value = values[field.key]

        if (field.type === 'text') {
          return (
            <Field key={field.id}>
              <FieldLabel>{field.label || 'Text'}</FieldLabel>
              <Input
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => updateValue(field.key, event.target.value)}
                placeholder={field.placeholder || ''}
              />
            </Field>
          )
        }

        if (field.type === 'textarea') {
          return (
            <Field key={field.id}>
              <FieldLabel>{field.label || 'Textarea'}</FieldLabel>
              <Textarea
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => updateValue(field.key, event.target.value)}
                placeholder={field.placeholder || ''}
              />
            </Field>
          )
        }

        if (field.type === 'number') {
          return (
            <Field key={field.id}>
              <FieldLabel>{field.label || 'Number'}</FieldLabel>
              <Input
                type="number"
                value={value === null || value === undefined ? '' : String(value)}
                onChange={(event) => updateValue(field.key, event.target.value)}
                placeholder={field.placeholder || ''}
              />
            </Field>
          )
        }

        if (field.type === 'link') {
          return (
            <Field key={field.id}>
              <FieldLabel>{field.label || 'Link'}</FieldLabel>
              <Input
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => updateValue(field.key, event.target.value)}
                placeholder={field.placeholder || 'https://example.com'}
              />
            </Field>
          )
        }

        if (field.type === 'toggle') {
          return (
            <div key={field.id} className="flex items-center justify-between rounded-lg border p-4">
              <span className="text-sm font-medium">{field.label || 'Toggle'}</span>
              <Switch
                checked={value === true}
                onCheckedChange={(checked) => updateValue(field.key, checked === true)}
              />
            </div>
          )
        }

        if (field.type === 'select') {
          return (
            <Field key={field.id}>
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
          )
        }

        if (field.type === 'image') {
          return (
            <div key={field.id}>
              <MediaInput
                label={field.label || 'Image'}
                value={typeof value === 'string' ? value : ''}
                onChange={(nextValue) => updateValue(field.key, nextValue)}
                siteId={siteId}
                acceptVideo={false}
              />
            </div>
          )
        }

        if (field.type === 'rich-text') {
          return (
            <Field key={field.id}>
              <FieldLabel>{field.label || 'Rich Text'}</FieldLabel>
              <RichTextEditor
                content={{
                  content: typeof value === 'string' ? value : '',
                  hideHeader: true,
                  hideEditorHeader: true,
                }}
                onContentChange={(nextContent) => updateValue(field.key, nextContent.content)}
                compact
                placeholder={field.placeholder || 'Start writing...'}
              />
            </Field>
          )
        }

        if (field.type === 'repeater') {
          return (
            <RepeaterFieldEditor
              key={field.id}
              fieldLabel={field.label || 'Repeater'}
              siteId={siteId}
              rowFields={field.fields || []}
              rows={Array.isArray(value) ? value : []}
              onChange={(nextRows) => updateValue(field.key, nextRows)}
            />
          )
        }

        return null
      })}
    </div>
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
          <Trash2 className="h-4 w-4 text-red-600" />
        </Button>
      </div>

      <RepeaterRowFields
        fields={rowFields}
        row={row}
        siteId={siteId}
        onChange={onChange}
      />
    </div>
  )
}

function RepeaterRowFields({
  fields,
  row,
  siteId,
  onChange,
}: {
  fields: DirectoryCustomBlockRepeaterField[]
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
    <div className="space-y-4">
      {fields.map(field => {
        const value = row[field.key]

        if (field.type === 'text') {
          return (
            <Field key={field.id}>
              <FieldLabel>{field.label || 'Text'}</FieldLabel>
              <Input
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => updateValue(field.key, event.target.value)}
                placeholder={field.placeholder || ''}
              />
            </Field>
          )
        }

        if (field.type === 'textarea') {
          return (
            <Field key={field.id}>
              <FieldLabel>{field.label || 'Textarea'}</FieldLabel>
              <Textarea
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => updateValue(field.key, event.target.value)}
                placeholder={field.placeholder || ''}
              />
            </Field>
          )
        }

        if (field.type === 'number') {
          return (
            <Field key={field.id}>
              <FieldLabel>{field.label || 'Number'}</FieldLabel>
              <Input
                type="number"
                value={value === null || value === undefined ? '' : String(value)}
                onChange={(event) => updateValue(field.key, event.target.value)}
                placeholder={field.placeholder || ''}
              />
            </Field>
          )
        }

        if (field.type === 'link') {
          return (
            <Field key={field.id}>
              <FieldLabel>{field.label || 'Link'}</FieldLabel>
              <Input
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => updateValue(field.key, event.target.value)}
                placeholder={field.placeholder || 'https://example.com'}
              />
            </Field>
          )
        }

        if (field.type === 'toggle') {
          return (
            <div key={field.id} className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">{field.label || 'Toggle'}</span>
              <Switch
                checked={value === true}
                onCheckedChange={(checked) => updateValue(field.key, checked === true)}
              />
            </div>
          )
        }

        if (field.type === 'select') {
          return (
            <Field key={field.id}>
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
          )
        }

        if (field.type === 'image') {
          return (
            <div key={field.id}>
              <MediaInput
                label={field.label || 'Image'}
                value={typeof value === 'string' ? value : ''}
                onChange={(nextValue) => updateValue(field.key, nextValue)}
                siteId={siteId}
                acceptVideo={false}
              />
            </div>
          )
        }

        if (field.type === 'rich-text') {
          return (
            <Field key={field.id}>
              <FieldLabel>{field.label || 'Rich Text'}</FieldLabel>
              <RichTextEditor
                content={{
                  content: typeof value === 'string' ? value : '',
                  hideHeader: true,
                  hideEditorHeader: true,
                }}
                onContentChange={(nextContent) => updateValue(field.key, nextContent.content)}
                compact
                placeholder={field.placeholder || 'Start writing...'}
              />
            </Field>
          )
        }

        return null
      })}
    </div>
  )
}
