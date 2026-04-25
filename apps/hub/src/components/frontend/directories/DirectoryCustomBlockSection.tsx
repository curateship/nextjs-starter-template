import { cn } from "@/lib/utils/tailwind"
import type {
  DirectoryCustomBlockField,
  DirectoryCustomBlockRepeaterField,
  DirectoryCustomBlockTemplate,
} from "@/lib/actions/directories/directory-custom-blocks/types"

interface DirectoryCustomBlockSectionProps {
  template: Pick<DirectoryCustomBlockTemplate, 'name' | 'layout' | 'fields'>
  values: Record<string, any>
}

export function DirectoryCustomBlockSection({
  template,
  values,
}: DirectoryCustomBlockSectionProps) {
  const isStackCard = template.layout === 'stack-card'
  const fieldsWithContent = template.fields.filter(field => hasFieldContent(field, values[field.key]))

  if (!fieldsWithContent.length) {
    return null
  }

  return (
    <div className="pt-6 lg:pt-10">
      {!isStackCard && <SectionHeading title={template.name} />}

      {template.layout === 'two-column' ? (
        <TwoColumnLayout fields={fieldsWithContent} values={values} />
      ) : isStackCard ? (
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="">
            <SectionHeading title={template.name} />
            <StackLayout fields={fieldsWithContent} values={values} />
          </div>
        </div>
      ) : (
        <StackLayout fields={fieldsWithContent} values={values} />
      )}
    </div>
  )
}

function SectionHeading({ title }: { title: string }) {
  return <h3 className="text-2xl font-semibold tracking-tight md:text-2xl">{title}</h3>
}

function TwoColumnLayout({
  fields,
  values,
}: {
  fields: DirectoryCustomBlockField[]
  values: Record<string, any>
}) {
  const leftFields = fields.filter(field => field.column !== 'right')
  const rightFields = fields.filter(field => field.column === 'right')
  const hasBothColumns = leftFields.length > 0 && rightFields.length > 0

  return (
    <div className={cn("grid gap-8", hasBothColumns && "md:grid-cols-2")}>
      <StackLayout fields={leftFields.length ? leftFields : rightFields} values={values} />
      {hasBothColumns && <StackLayout fields={rightFields} values={values} />}
    </div>
  )
}

function StackLayout({
  fields,
  values,
}: {
  fields: DirectoryCustomBlockField[]
  values: Record<string, any>
}) {
  return (
    <div className="space-y-6">
      {fields.map(field => (
        <FieldRenderer key={field.id} field={field} value={values[field.key]} />
      ))}
    </div>
  )
}

function FieldRenderer({
  field,
  value,
}: {
  field: DirectoryCustomBlockField
  value: any
}) {
  if (!hasFieldContent(field, value)) return null

  if (field.type === 'image' && typeof value === 'string') {
    return (
      <div className="space-y-3">
        {field.label && <FieldLabel label={field.label} />}
        <img
          src={value}
          alt={field.label || 'Custom block image'}
          className="aspect-video w-full rounded-xl border object-cover"
        />
      </div>
    )
  }

  if (field.type === 'rich-text' && typeof value === 'string') {
    return (
      <div className="space-y-3">
        {field.label && <FieldLabel label={field.label} />}
        <div
          className="prose max-w-none prose-neutral dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      </div>
    )
  }

  if (field.type === 'link' && typeof value === 'string') {
    return (
      <div className="space-y-1.5">
        {field.label && <FieldLabel label={field.label} />}
        <a href={value} className="text-base font-medium text-primary underline underline-offset-4">
          {value}
        </a>
      </div>
    )
  }

  if (field.type === 'repeater' && Array.isArray(value)) {
    return (
      <div className="space-y-4">
        {field.label && <FieldLabel label={field.label} />}
        <div className="grid gap-4 sm:grid-cols-2">
          {value.filter(row => row && typeof row === 'object').map((row, index) => (
            <div key={`${field.id}-${index}`} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="space-y-3">
                {(field.fields || []).map(subField => (
                  <RepeaterFieldRenderer key={subField.id} field={subField} value={row[subField.key]} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {field.label && <FieldLabel label={field.label} />}
      <div className="text-base leading-7 text-foreground">
        {field.type === 'toggle' ? (value ? 'Yes' : 'No') : String(value)}
      </div>
    </div>
  )
}

function RepeaterFieldRenderer({
  field,
  value,
}: {
  field: DirectoryCustomBlockRepeaterField
  value: any
}) {
  if (!hasSimpleFieldContent(field.type, value)) return null

  if (field.type === 'image' && typeof value === 'string') {
    return (
      <div className="space-y-2">
        {field.label && <FieldLabel label={field.label} small />}
        <img
          src={value}
          alt={field.label || 'Repeater image'}
          className="aspect-video w-full rounded-lg border object-cover"
        />
      </div>
    )
  }

  if (field.type === 'rich-text' && typeof value === 'string') {
    return (
      <div className="space-y-2">
        {field.label && <FieldLabel label={field.label} small />}
        <div
          className="prose prose-sm max-w-none prose-neutral dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      </div>
    )
  }

  if (field.type === 'link' && typeof value === 'string') {
    return (
      <div className="space-y-1">
        {field.label && <FieldLabel label={field.label} small />}
        <a href={value} className="text-sm font-medium text-primary underline underline-offset-4">
          {value}
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {field.label && <FieldLabel label={field.label} small />}
      <div className="text-sm leading-6 text-foreground">
        {field.type === 'toggle' ? (value ? 'Yes' : 'No') : String(value)}
      </div>
    </div>
  )
}

function FieldLabel({ label, small = false }: { label: string; small?: boolean }) {
  return (
    <p className={cn(
      "font-medium tracking-wide text-muted-foreground",
      small ? "text-[11px] uppercase" : "text-xs uppercase",
    )}>
      {label}
    </p>
  )
}

function hasFieldContent(field: DirectoryCustomBlockField, value: any) {
  if (field.type === 'repeater') {
    return Array.isArray(value) && value.some(row =>
      row && typeof row === 'object' && (field.fields || []).some(subField => hasSimpleFieldContent(subField.type, row[subField.key]))
    )
  }

  return hasSimpleFieldContent(field.type, value)
}

function hasSimpleFieldContent(type: DirectoryCustomBlockField['type'] | DirectoryCustomBlockRepeaterField['type'], value: any) {
  if (type === 'toggle') return typeof value === 'boolean'
  if (type === 'number') return value !== null && value !== undefined && String(value).trim() !== ''
  return typeof value === 'string' ? value.trim().length > 0 : !!value
}
