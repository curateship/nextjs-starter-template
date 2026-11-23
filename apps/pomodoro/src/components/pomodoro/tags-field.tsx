import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { normalizeTag } from "@/lib/pomodoro/media-pool"

/**
 * The tags box: words separated by commas, with the tags already in use one
 * click away so the same word is not spelled three ways. The catalogue window
 * and the member's upload window both use it.
 */
export function TagsField({
  id,
  label = "Tags",
  hint,
  value,
  onChange,
  knownTags,
  errorId,
}: {
  id: string
  label?: string
  hint?: string
  value: string
  onChange: (value: string) => void
  knownTags: string[]
  /** The id of the line saying what is wrong, when something is. */
  errorId?: string
}) {
  const typed = value
    .split(",")
    .map((tag) => normalizeTag(tag))
    .filter((tag): tag is string => tag !== null)
  const offered = knownTags.filter((tag) => !typed.includes(tag)).slice(0, 12)
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        value={value}
        placeholder="rain, night"
        aria-invalid={errorId ? true : undefined}
        aria-describedby={errorId}
        onChange={(event) => onChange(event.target.value)}
      />
      {offered.length ? (
        <div className="flex flex-wrap gap-1">
          {offered.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant="outline"
              size="xs"
              onClick={() =>
                onChange(typed.length ? `${typed.join(", ")}, ${tag}` : tag)
              }
            >
              {tag}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
