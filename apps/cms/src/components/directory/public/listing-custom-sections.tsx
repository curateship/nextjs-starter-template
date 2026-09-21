import { CheckIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { WrittenPageBody } from "@/components/pages/written-page-body"
import {
  type CustomSectionView,
  type CustomSimpleFieldType,
  type CustomSimpleValue,
} from "@/lib/directory/custom-fields"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { cn } from "@/lib/utils"

/**
 * The fields a site invented, on a listing's page, under the write-up.
 *
 * Everything here has already been decided on the server: which sections have
 * anything in them, which fields were filled in, and what a choice's wording
 * is. This component draws what it is handed and makes no judgements of its
 * own — an empty section never reaches it.
 *
 * Nothing is built from a string of markup. Written text goes through the same
 * renderer the shell's own pages use, which builds elements from stored nodes,
 * and every address was already refused or kept whole by the cleaner.
 */
export function ListingCustomSections({
  sections,
}: {
  sections: CustomSectionView[]
}) {
  if (!sections.length) return null

  return (
    <>
      {sections.map((section) => (
        <Card key={section.slug}>
          <CardContent className="grid gap-3">
            <h2 className="text-lg font-semibold">{section.name}</h2>
            <div
              className={cn(
                "grid gap-4",
                section.layout === "two-column" && "sm:grid-cols-2",
                section.layout === "card" && "rounded-lg border p-3"
              )}
            >
              {section.fields.map((field) =>
                field.type === "repeater" ? (
                  <div key={field.key} className="grid gap-2">
                    <h3 className="text-sm font-medium">{field.label}</h3>
                    <div className="grid gap-2">
                      {field.rows.map((row, index) => (
                        <div
                          key={index}
                          className="grid gap-1 rounded-md border p-3"
                        >
                          {row.map((entry) => (
                            <FieldLine
                              key={entry.key}
                              label={entry.label}
                              type={entry.type}
                              value={entry.value}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <FieldLine
                    key={field.key}
                    label={field.label}
                    type={field.type as CustomSimpleFieldType}
                    value={field.value as CustomSimpleValue}
                  />
                )
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}

function FieldLine({
  label,
  type,
  value,
}: {
  label: string
  type: CustomSimpleFieldType
  value: CustomSimpleValue
}) {
  if (type === "image" && typeof value === "string") {
    return (
      <figure className="grid gap-1">
        <img
          src={value}
          alt={label}
          loading="lazy"
          decoding="async"
          className="w-full max-w-sm rounded-lg object-cover"
        />
        <figcaption className="text-xs text-muted-foreground">
          {label}
        </figcaption>
      </figure>
    )
  }

  if (type === "richText") {
    return (
      <div className="grid gap-1">
        <h3 className="text-sm font-medium">{label}</h3>
        <WrittenPageBody body={value as WrittenPageNode} />
      </div>
    )
  }

  if (type === "tags" && Array.isArray(value)) {
    return (
      <div className="grid gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </h3>
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-sm font-medium"
            >
              {/* The tick is what turns a word into a statement: this place
                  does do breakfast. A bare pill reads as a filter. */}
              <CheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {tag}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (type === "link" && typeof value === "string") {
    return (
      <p className="text-sm">
        <span className="text-muted-foreground">{label}: </span>
        <a
          href={value}
          target="_blank"
          rel="noreferrer nofollow"
          className="underline underline-offset-2"
        >
          {value}
        </a>
      </p>
    )
  }

  // A yes-or-no only reaches here when it is a yes, so its name is the whole
  // statement — "Wheelchair access: Yes" says the same thing twice.
  if (type === "toggle") {
    return <p className="text-sm">{label}</p>
  }

  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      {typeof value === "number" ? value.toLocaleString() : String(value ?? "")}
    </p>
  )
}
