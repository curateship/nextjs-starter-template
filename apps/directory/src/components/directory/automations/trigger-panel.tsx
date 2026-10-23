import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  DIRECTORY_TRIGGER_HINTS,
  DIRECTORY_TRIGGER_KINDS,
  FEATURED_ENDING_CHOICES,
  FEATURED_ENDING_KIND,
  readFeaturedDaysBefore,
  type DirectoryTriggerKind,
} from "@/lib/directory/automation-nodes"
import { plural } from "@/lib/format/plural"

/**
 * The settings panel of the four directory triggers. Only "Featured spot
 * ending" has anything to set; the other three say what starts them and who
 * the run is about.
 */
export default function DirectoryTriggerFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const kind = (DIRECTORY_TRIGGER_KINDS as readonly string[]).includes(
    node.kind
  )
    ? (node.kind as DirectoryTriggerKind)
    : null
  if (!kind) return null

  const daysBefore = readFeaturedDaysBefore(node.settings)
  // A flow saved with a number the list no longer offers keeps it selectable.
  const dayChoices = FEATURED_ENDING_CHOICES.includes(
    daysBefore as (typeof FEATURED_ENDING_CHOICES)[number]
  )
    ? [...FEATURED_ENDING_CHOICES]
    : [...FEATURED_ENDING_CHOICES, daysBefore].sort((a, b) => a - b)

  return (
    <InspectorCard title="Settings">
      {kind === FEATURED_ENDING_KIND ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`featured-ending-${node.id}-days`}
            className="text-xs"
            hint="A spot already inside this window when you switch the flow on starts straight away."
          >
            When the spot has this long left
          </FieldLabel>
          <Select
            value={String(daysBefore)}
            onValueChange={(value) =>
              onChange({
                ...node,
                settings: { ...node.settings, daysBefore: Number(value) },
              })
            }
          >
            <SelectTrigger
              id={`featured-ending-${node.id}-days`}
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dayChoices.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {days} {plural(days, "day", "days")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <InspectorNote>{DIRECTORY_TRIGGER_HINTS[kind]}</InspectorNote>
    </InspectorCard>
  )
}
