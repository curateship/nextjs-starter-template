import { cn } from "@/lib/utils/tailwind"
import { Card, CardGroup, CardContent } from "@/components/ui/card"
import { sanitizeRichHtml } from "@/lib/utils/html-sanitizer"
import { sanitizeUrl } from "@/lib/utils/url-validator"
import { Check } from "lucide-react"
import type { HTMLAttributes } from "react"
import type {
  DirectoryCustomBlockField,
  DirectoryCustomBlockRepeaterField,
  DirectoryCustomBlockTemplate
} from "@/lib/actions/directories/directory-custom-blocks/types"

interface DirectoryCustomBlockSectionProps {
  template: Pick<DirectoryCustomBlockTemplate, "name" | "layout" | "fields">
  values: Record<string, any>
  cardProps?: HTMLAttributes<HTMLDivElement>
}

export function DirectoryCustomBlockSection({
  template,
  values,
  cardProps
}: DirectoryCustomBlockSectionProps) {
  const fieldsWithContent = template.fields.filter((field) => hasFieldContent(field, values[field.key]))

  if (!fieldsWithContent.length) {
    return null
  }

  const { className: cardClassName, ...rootProps } = cardProps || {}

  return (
    <Card {...rootProps} className={cardClassName}>
      <CardContent>
        <SectionHeading title={template.name} />
        {template.layout === "two-column" ? (
          <TwoColumnLayout fields={fieldsWithContent} values={values} />
        ) : (
          <StackLayout fields={fieldsWithContent} values={values} />
        )}
      </CardContent>
    </Card>
  )
}

function SectionHeading({ title }: { title: string }) {
  return <h3 className="text-2xl font-semibold tracking-tight md:text-2xl">{title}</h3>
}

function TwoColumnLayout({ fields, values }: { fields: DirectoryCustomBlockField[]; values: Record<string, any> }) {
  const leftFields = fields.filter((field) => field.column !== "right")
  const rightFields = fields.filter((field) => field.column === "right")
  const hasBothColumns = leftFields.length > 0 && rightFields.length > 0

  return (
    <div className={cn("grid gap-8", hasBothColumns && "md:grid-cols-2")}>
      <StackLayout fields={leftFields.length ? leftFields : rightFields} values={values} />
      {hasBothColumns && <StackLayout fields={rightFields} values={values} />}
    </div>
  )
}

function StackLayout({ fields, values }: { fields: DirectoryCustomBlockField[]; values: Record<string, any> }) {
  return (
    <div className="space-y-6">
      {fields.map((field) => (
        <FieldRenderer key={field.id} field={field} value={values[field.key]} />
      ))}
    </div>
  )
}

function FieldRenderer({ field, value }: { field: DirectoryCustomBlockField; value: any }) {
  if (!hasFieldContent(field, value)) return null

  if (field.type === "image" && typeof value === "string") {
    const safeSrc = sanitizeUrl(value, "")
    if (!safeSrc) return null

    return (
      <div className="space-y-3">
        {field.label && <FieldLabel label={field.label} />}
        <img
          src={safeSrc}
          alt={field.label || "Custom block image"}
          className="aspect-video w-full rounded-xl border object-cover"
        />
      </div>
    )
  }

  if (field.type === "rich-text" && typeof value === "string") {
    return (
      <div className="space-y-3">
        {field.label && <FieldLabel label={field.label} />}
        <div
          className="prose max-w-none prose-neutral dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(value) }}
        />
      </div>
    )
  }

  if (field.type === "link" && typeof value === "string") {
    const safeHref = sanitizeUrl(value, "")
    if (!safeHref) return null

    return (
      <div className="space-y-1.5">
        {field.label && <FieldLabel label={field.label} />}
        <a href={safeHref} className="text-base font-medium text-primary underline underline-offset-4">
          {safeHref}
        </a>
      </div>
    )
  }

  if (field.type === "tags") {
    const tags = parseTagValue(value)
    if (!tags.length) return null

    return (
      <div className="space-y-3">
        {field.label && <FieldLabel label={field.label} />}
        <TagChips tags={tags} />
      </div>
    )
  }

  if (field.type === "repeater" && Array.isArray(value)) {
    return (
      <div className="space-y-4">
        {field.label && <FieldLabel label={field.label} />}
        <CardGroup className="grid sm:grid-cols-2">
          {value
            .filter((row) => row && typeof row === "object")
            .map((row, index) => (
              <Card key={`${field.id}-${index}`}>
                <CardContent>
                  {(field.fields || []).map((subField) => (
                    <RepeaterFieldRenderer key={subField.id} field={subField} value={row[subField.key]} />
                  ))}
                </CardContent>
              </Card>
            ))}
        </CardGroup>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {field.label && <FieldLabel label={field.label} />}
      <div className="text-base leading-7 text-foreground">
        {field.type === "toggle" ? (value ? "Yes" : "No") : String(value)}
      </div>
    </div>
  )
}

function RepeaterFieldRenderer({ field, value }: { field: DirectoryCustomBlockRepeaterField; value: any }) {
  if (!hasSimpleFieldContent(field.type, value)) return null

  if (field.type === "image" && typeof value === "string") {
    const safeSrc = sanitizeUrl(value, "")
    if (!safeSrc) return null

    return (
      <div className="space-y-2">
        {field.label && <FieldLabel label={field.label} small />}
        <img
          src={safeSrc}
          alt={field.label || "Repeater image"}
          className="aspect-video w-full rounded-lg border object-cover"
        />
      </div>
    )
  }

  if (field.type === "rich-text" && typeof value === "string") {
    return (
      <div className="space-y-2">
        {field.label && <FieldLabel label={field.label} small />}
        <div
          className="prose prose-sm max-w-none prose-neutral dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(value) }}
        />
      </div>
    )
  }

  if (field.type === "link" && typeof value === "string") {
    const safeHref = sanitizeUrl(value, "")
    if (!safeHref) return null

    return (
      <div className="space-y-1">
        {field.label && <FieldLabel label={field.label} small />}
        <a href={safeHref} className="text-sm font-medium text-primary underline underline-offset-4">
          {safeHref}
        </a>
      </div>
    )
  }

  if (field.type === "tags") {
    const tags = parseTagValue(value)
    if (!tags.length) return null

    return (
      <div className="space-y-2">
        {field.label && <FieldLabel label={field.label} small />}
        <TagChips tags={tags} small />
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {field.label && <FieldLabel label={field.label} small />}
      <div className="text-sm leading-6 text-foreground">
        {field.type === "toggle" ? (value ? "Yes" : "No") : String(value)}
      </div>
    </div>
  )
}

function TagChips({ tags, small = false }: { tags: string[]; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className={cn(
            "inline-flex items-center rounded-full border bg-muted/50 font-medium text-foreground",
            small ? "gap-1 px-2 py-0.5 text-xs" : "gap-1.5 px-3 py-1 text-sm"
          )}
        >
          <Check className={small ? "size-3" : "size-3.5"} />
          {tag}
        </span>
      ))}
    </div>
  )
}

function FieldLabel({ label, small = false }: { label: string; small?: boolean }) {
  return (
    <p
      className={cn(
        "font-medium tracking-wide text-muted-foreground",
        small ? "text-[11px] uppercase" : "text-xs uppercase"
      )}
    >
      {label}
    </p>
  )
}

function hasFieldContent(field: DirectoryCustomBlockField, value: any) {
  if (field.type === "repeater") {
    return (
      Array.isArray(value) &&
      value.some(
        (row) =>
          row &&
          typeof row === "object" &&
          (field.fields || []).some((subField) => hasSimpleFieldContent(subField.type, row[subField.key]))
      )
    )
  }

  return hasSimpleFieldContent(field.type, value)
}

function hasSimpleFieldContent(
  type: DirectoryCustomBlockField["type"] | DirectoryCustomBlockRepeaterField["type"],
  value: any
) {
  if (type === "toggle") return typeof value === "boolean"
  if (type === "tags") return parseTagValue(value).length > 0
  if (type === "number") return value !== null && value !== undefined && String(value).trim() !== ""
  if ((type === "link" || type === "image") && typeof value === "string") return Boolean(sanitizeUrl(value, ""))
  return typeof value === "string" ? value.trim().length > 0 : !!value
}

function parseTagValue(value: any) {
  const rawTags = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []
  return rawTags
    .map((tag) => String(tag).trim())
    .filter(Boolean)
}
