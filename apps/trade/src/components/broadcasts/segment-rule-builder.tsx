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
import { FieldLabel } from "@/components/ui/field-label"
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
  MAX_RULE_DAYS,
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
 * The whole list can require every rule or any one rule. There are deliberately
 * no nested groups or brackets: that would become a query tool nobody can read
 * back.
 */
export function SegmentRuleBuilder({
  conditions,
  onChange,
  match,
  onMatchChange,
  options,
  excludeSegmentId,
  idPrefix = "segment-rule",
  title,
  description,
  emptyText,
}: {
  conditions: SegmentCondition[]
  onChange: (conditions: SegmentCondition[]) => void
  match: "all" | "any"
  onMatchChange: (match: "all" | "any") => void
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
    "emailed",
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
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={`${idPrefix}-match`}
              hint="Choose whether one rule is enough or every rule must be true."
            >
              People must match
            </FieldLabel>
            <Select
              value={match}
              onValueChange={(value) => onMatchChange(value as "all" | "any")}
            >
              <SelectTrigger
                id={`${idPrefix}-match`}
                className="w-full sm:w-fit"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All of these rules</SelectItem>
                <SelectItem value="any">Any of these rules</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {conditions.length === 0 ? (
            <span className="text-sm text-muted-foreground">{emptyText}</span>
          ) : null}
        </CardContent>
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
            <DaysInput
              index={index}
              days={condition.days}
              suffix={condition.operator === "within" ? "days" : "days ago"}
              onChange={(days) => onChange({ ...condition, days })}
            />
          </>
        ) : null}

        {condition.type === "emailed" ? (
          <>
            <OperatorSelect
              id={`${id}-operator`}
              aria-label={operatorLabel}
              value={condition.operator}
              options={[
                { value: "within", label: "in the last" },
                { value: "before", label: "not in the last" },
                { value: "never", label: "never" },
              ]}
              onChange={(operator) =>
                onChange({
                  ...condition,
                  operator: operator as "within" | "before" | "never",
                })
              }
            />
            {/* "Never" has no number to fill in. The typed one is kept in the
                rule rather than reset, so switching back and forth does not
                quietly lose it. */}
            {condition.operator === "never" ? null : (
              <DaysInput
                index={index}
                days={condition.days}
                suffix="days"
                onChange={(days) => onChange({ ...condition, days })}
              />
            )}
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

/**
 * The number of days a "when they joined" or "when they were last emailed"
 * rule counts back, with the word after it.
 *
 * Clamped to the same 1–3650 the saved shape allows, so a number nobody could
 * save is one nobody can type either.
 */
function DaysInput({
  index,
  days,
  suffix,
  onChange,
}: {
  index: number
  days: number
  suffix: string
  onChange: (days: number) => void
}) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <Input
        type="number"
        min={1}
        max={MAX_RULE_DAYS}
        className="w-24"
        value={days}
        aria-label={`Number of days for rule ${index + 1}`}
        onChange={(event) =>
          onChange(
            Math.min(
              MAX_RULE_DAYS,
              Math.max(1, Number(event.target.value) || 1)
            )
          )
        }
      />
      <span className="text-sm text-muted-foreground">{suffix}</span>
    </div>
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
