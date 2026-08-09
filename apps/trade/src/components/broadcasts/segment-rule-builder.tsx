import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CONTACT_SEGMENT_STATUSES,
  MAX_SEGMENT_CONDITIONS,
  newSegmentCondition,
  segmentConditionIsComplete,
  segmentConditionLabels,
  segmentStatusLabels,
  type SegmentCondition,
  type SegmentConditionType,
  type SegmentRuleOptions,
} from "@/lib/contacts/contact-segments"

/**
 * The rule builder, in one place because there are two screens that build the
 * same rules: the segment window, and the contacts list's filters.
 *
 * One builder rather than two is the whole point. A filter on the contacts list
 * and a saved segment describe people in exactly the same words, which is what
 * makes "the list I am looking at" and "the segment I saved" the same group
 * rather than two things that drift.
 *
 * Every rule has to be true. There is no "or" and no brackets, deliberately: a
 * builder with grouping is a query tool nobody can read back.
 */
export function SegmentRuleBuilder({
  conditions,
  onChange,
  options,
  excludeSegmentId,
  idPrefix = "segment-rule",
  title,
  description,
  emptyText,
}: {
  conditions: SegmentCondition[]
  onChange: (conditions: SegmentCondition[]) => void
  options: SegmentRuleOptions
  /** The segment being edited, which must not be offered as one to leave out. */
  excludeSegmentId?: string
  /** Keeps the two builders' element ids apart when both are on one page. */
  idPrefix?: string
  title: string
  description: React.ReactNode
  /** What to say when there are no rules yet. */
  emptyText: string
}) {
  /**
   * A rule is only offered once there is something for it to name. An empty tag
   * or plan rule could only ever match nobody, and offering it invites somebody
   * to save one and wonder why their list is empty.
   */
  const availableTypes: SegmentConditionType[] = [
    ...(options.tags.length ? (["tag"] as const) : []),
    "status",
    ...(options.sources.length ? (["source"] as const) : []),
    "joined",
    "account",
    ...(options.plans.length ? (["plan"] as const) : []),
    ...(options.segments.some((other) => other.id !== excludeSegmentId)
      ? (["notIn"] as const)
      : []),
  ]

  // A heading card that explains the rules and offers the way to add one, then
  // the rules themselves as its siblings. Cards inside cards would be a box in
  // a box saying the same thing twice.
  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={conditions.length >= MAX_SEGMENT_CONDITIONS}
                >
                  <PlusIcon className="size-4" />
                  Add a rule
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableTypes.map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onSelect={() =>
                      onChange([...conditions, newSegmentCondition(type)])
                    }
                  >
                    {segmentConditionLabels[type]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>
        {conditions.length === 0 ? (
          <CardContent className="text-sm text-muted-foreground">
            {emptyText}
          </CardContent>
        ) : null}
      </Card>

      {conditions.map((condition, index) => (
        <ConditionRow
          key={index}
          index={index}
          idPrefix={idPrefix}
          condition={condition}
          options={options}
          excludeSegmentId={excludeSegmentId}
          onChange={(next) =>
            onChange(
              conditions.map((current, at) => (at === index ? next : current))
            )
          }
          onRemove={() => onChange(conditions.filter((_, at) => at !== index))}
        />
      ))}
    </>
  )
}
/**
 * One rule, in a card of its own.
 *
 * A card each rather than rows sharing one, because a rule is a group of fields
 * that only make sense together — and because the button that throws it away
 * then sits on the rule it removes, instead of floating at the edge of the
 * section beside whichever row happens to be level with it.
 *
 * The card's title is the rule's visible name; each control inside carries its
 * own accessible name, since "is" and "On the list" mean nothing read alone.
 */
function ConditionRow({
  index,
  idPrefix,
  condition,
  options,
  excludeSegmentId,
  onChange,
  onRemove,
}: {
  index: number
  idPrefix: string
  condition: SegmentCondition
  options: SegmentRuleOptions
  excludeSegmentId?: string
  onChange: (condition: SegmentCondition) => void
  onRemove: () => void
}) {
  const id = `${idPrefix}-${index}`
  const label = segmentConditionLabels[condition.type]
  const operatorLabel = `${label} comparison for rule ${index + 1}`
  const incomplete = !segmentConditionIsComplete(condition)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardAction>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            title="Remove this rule"
            aria-label={`Remove the ${label.toLowerCase()} rule`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-start">
        {condition.type === "tag" ? (
          <>
            <OperatorSelect
              id={`${id}-operator`}
              aria-label={operatorLabel}
              value={condition.operator}
              options={[
                { value: "includes", label: "has any of" },
                { value: "excludes", label: "has none of" },
              ]}
              onChange={(operator) =>
                onChange({ ...condition, operator: operator as "includes" | "excludes" })
              }
            />
            <Input
              className="sm:flex-1"
              value={condition.tags.join(", ")}
              placeholder={options.tags.slice(0, 2).join(", ")}
              aria-label={`Tags for rule ${index + 1}`}
              aria-invalid={incomplete || undefined}
              onChange={(event) =>
                onChange({
                  ...condition,
                  tags: event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
            />
          </>
        ) : null}

        {condition.type === "status" ? (
          <>
            <OperatorSelect
              id={`${id}-operator`}
              aria-label={operatorLabel}
              value={condition.operator}
              options={[
                { value: "is", label: "is" },
                { value: "isnt", label: "is not" },
              ]}
              onChange={(operator) =>
                onChange({ ...condition, operator: operator as "is" | "isnt" })
              }
            />
            <Select
              value={condition.status}
              onValueChange={(value) =>
                onChange({
                  ...condition,
                  status: value as (typeof CONTACT_SEGMENT_STATUSES)[number],
                })
              }
            >
              <SelectTrigger
                className="w-full sm:w-fit"
                aria-label={`Status for rule ${index + 1}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_SEGMENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {segmentStatusLabels[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}

        {condition.type === "source" ? (
          <>
            <OperatorSelect
              id={`${id}-operator`}
              aria-label={operatorLabel}
              value={condition.operator}
              options={[
                { value: "is", label: "is" },
                { value: "isnt", label: "is not" },
              ]}
              onChange={(operator) =>
                onChange({ ...condition, operator: operator as "is" | "isnt" })
              }
            />
            <Select
              value={condition.source}
              onValueChange={(value) => onChange({ ...condition, source: value })}
            >
              <SelectTrigger
                className="w-full sm:w-fit"
                aria-label={`Where they came from, for rule ${index + 1}`}
                aria-invalid={incomplete || undefined}
              >
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {options.sources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}

        {condition.type === "joined" ? (
          <>
            <OperatorSelect
              id={`${id}-operator`}
              aria-label={operatorLabel}
              value={condition.operator}
              options={[
                { value: "within", label: "in the last" },
                { value: "before", label: "more than" },
              ]}
              onChange={(operator) =>
                onChange({
                  ...condition,
                  operator: operator as "within" | "before",
                })
              }
            />
            <div className="flex flex-1 items-center gap-2">
              <Input
                type="number"
                min={1}
                max={3650}
                className="w-24"
                value={condition.days}
                aria-label={`Number of days for rule ${index + 1}`}
                onChange={(event) =>
                  onChange({
                    ...condition,
                    days: Math.min(
                      3650,
                      Math.max(1, Number(event.target.value) || 1)
                    ),
                  })
                }
              />
              <span className="text-sm text-muted-foreground">
                {condition.operator === "within" ? "days" : "days ago"}
              </span>
            </div>
          </>
        ) : null}

        {condition.type === "account" ? (
          <OperatorSelect
            id={`${id}-operator`}
            aria-label={operatorLabel}
            value={condition.operator}
            options={[
              { value: "has", label: "yes, they have one" },
              { value: "hasnt", label: "no, just an address" },
            ]}
            onChange={(operator) =>
              onChange({ ...condition, operator: operator as "has" | "hasnt" })
            }
          />
        ) : null}

        {condition.type === "plan" ? (
          <>
            <OperatorSelect
              id={`${id}-operator`}
              aria-label={operatorLabel}
              value={condition.operator}
              options={[
                { value: "is", label: "is" },
                { value: "isnt", label: "is not" },
              ]}
              onChange={(operator) =>
                onChange({ ...condition, operator: operator as "is" | "isnt" })
              }
            />
            <Select
              value={condition.planSlug}
              onValueChange={(value) =>
                onChange({ ...condition, planSlug: value })
              }
            >
              <SelectTrigger
                className="w-full sm:w-fit"
                aria-label={`Plan for rule ${index + 1}`}
                aria-invalid={incomplete || undefined}
              >
                <SelectValue placeholder="Pick a plan" />
              </SelectTrigger>
              <SelectContent>
                {options.plans.map((plan) => (
                  <SelectItem key={plan.slug} value={plan.slug}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}

        {condition.type === "notIn" ? (
          <div className="grid flex-1 gap-2">
            {options.segments
              .filter((other) => other.id !== excludeSegmentId)
              .map((other) => (
                <div key={other.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-${other.id}`}
                    checked={condition.segmentIds.includes(other.id)}
                    onCheckedChange={() =>
                      onChange({
                        ...condition,
                        segmentIds: condition.segmentIds.includes(other.id)
                          ? condition.segmentIds.filter((sid) => sid !== other.id)
                          : [...condition.segmentIds, other.id],
                      })
                    }
                  />
                  <Label htmlFor={`${id}-${other.id}`} className="font-normal">
                    {other.name}
                  </Label>
                </div>
              ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function OperatorSelect({
  id,
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
}: {
  id: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  "aria-label": string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={ariaLabel} className="w-full sm:w-fit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

