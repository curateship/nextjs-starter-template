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
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MultiCombobox } from "@/components/ui/multi-combobox"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
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
  MAX_RULE_EMAILS,
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
  /** The segment being edited, which must not be offered as a reference. */
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
    "engaged",
    "opened",
    ...(options.segments.some((other) => other.id !== excludeSegmentId)
      ? (["in", "notIn"] as const)
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
            <DisabledReason
              disabled={conditions.length >= MAX_SEGMENT_CONDITIONS}
              reason={`A segment can hold up to ${MAX_SEGMENT_CONDITIONS} rules.`}
            >
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
                {/* Wide enough for the longest rule name on one line.
                    `DropdownMenuContent` is `w-(--radix-dropdown-menu-trigger-width)`
                    by default, so without this the menu is exactly as wide as
                    the Add a rule button and seven of the eleven names wrap
                    onto two lines, "When they last opened or clicked" onto
                    three. */}
                <DropdownMenuContent align="end" className="w-72">
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
            </DisabledReason>
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
 * The tags a tag rule matches, picked from the ones contacts actually carry.
 *
 * It was a text field you typed comma-separated names into until 5 Oct 2026.
 * Tyler asked for a combobox, and the field deserved it: a name had to be
 * spelled exactly, nothing told you which tags existed, and a typo looked
 * identical to a tag nobody has, so the rule quietly matched nobody.
 *
 * A tag already on the rule that no contact carries any more is still listed
 * and still ticked, so opening an old rule and saving it cannot silently drop
 * part of what it matches. `MultiCombobox` holds that rule.
 */
function TagConditionInput({ condition, index, incomplete, onChange, tags }: {
  condition: Extract<SegmentCondition, { type: "tag" }>
  index: number
  incomplete: boolean
  onChange: (condition: SegmentCondition) => void
  /** Every tag in use, which is what there is to pick from. */
  tags: readonly string[]
}) {
  return (
    <MultiCombobox
      className="sm:flex-1"
      value={condition.tags}
      options={tags}
      placeholder="Pick tags"
      searchPlaceholder="Search tags"
      emptyLabel="No contact carries a tag yet"
      noMatchLabel="No tag matches that"
      invalid={incomplete}
      aria-label={`Tags for rule ${index + 1}`}
      onChange={(next) => onChange({ ...condition, tags: next })}
    />
  )
}

type Choice = { value: string; label: string }

const IS_OR_ISNT: Choice[] = [
  { value: "is", label: "is" },
  { value: "isnt", label: "is not" },
]

const SENT_IN_THE_LAST: Choice[] = [
  { value: "within", label: "in the last" },
  { value: "before", label: "not in the last" },
  { value: "never", label: "never" },
]

/** The comparisons each kind of rule offers, in the order the dropdown shows them. */
const RULE_OPERATORS: Record<
  Exclude<SegmentConditionType, "in" | "notIn">,
  Choice[]
> = {
  tag: [
    { value: "includes", label: "has any of" },
    { value: "excludes", label: "has none of" },
  ],
  status: IS_OR_ISNT,
  source: IS_OR_ISNT,
  joined: [
    { value: "within", label: "in the last" },
    { value: "before", label: "more than" },
  ],
  emailed: SENT_IN_THE_LAST,
  engaged: SENT_IN_THE_LAST,
  opened: [
    { value: "has", label: "opened one of the last" },
    { value: "hasnt", label: "opened none of the last" },
  ],
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
        {"operator" in condition ? (
          <ChoiceSelect
            id={`${id}-operator`}
            aria-label={`${label} comparison for rule ${index + 1}`}
            value={condition.operator}
            choices={RULE_OPERATORS[condition.type]}
            onChange={(operator) =>
              // The table above only offers this rule's own operators.
              onChange({ ...condition, operator } as SegmentCondition)
            }
          />
        ) : null}

        {condition.type === "tag" ? (
          <TagConditionInput condition={condition} index={index} tags={options.tags} incomplete={incomplete} onChange={onChange} />
        ) : null}

        {condition.type === "status" ? (
          <ChoiceSelect
            aria-label={`Status for rule ${index + 1}`}
            value={condition.status}
            choices={CONTACT_SEGMENT_STATUSES.map((status) => ({
              value: status,
              label: segmentStatusLabels[status],
            }))}
            onChange={(status) =>
              onChange({
                ...condition,
                status: status as (typeof CONTACT_SEGMENT_STATUSES)[number],
              })
            }
          />
        ) : null}

        {condition.type === "source" ? (
          <ChoiceSelect
            aria-label={`Where they came from, for rule ${index + 1}`}
            value={condition.source}
            placeholder="Pick one"
            invalid={incomplete}
            choices={options.sources.map((source) => ({
              value: source,
              label: source,
            }))}
            onChange={(source) => onChange({ ...condition, source })}
          />
        ) : null}

        {condition.type === "joined" ? (
          <AmountInput
            id={`${id}-days`}
            index={index}
            amount={condition.days}
            suffix={condition.operator === "within" ? "days" : "days ago"}
            onChange={(days) => onChange({ ...condition, days })}
          />
        ) : null}

        {/* "Never" has no number to fill in. The typed one is kept in the rule
            rather than reset, so switching back and forth does not quietly
            lose it. */}
        {(condition.type === "emailed" || condition.type === "engaged") &&
        condition.operator !== "never" ? (
          <AmountInput
            id={`${id}-days`}
            index={index}
            amount={condition.days}
            suffix="days"
            onChange={(days) => onChange({ ...condition, days })}
          />
        ) : null}

        {condition.type === "opened" ? (
          <AmountInput
            id={`${id}-emails`}
            index={index}
            amount={condition.emails}
            suffix="emails"
            unit="emails"
            max={MAX_RULE_EMAILS}
            onChange={(emails) => onChange({ ...condition, emails })}
          />
        ) : null}

        {condition.type === "in" || condition.type === "notIn" ? (
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
 * The number beside an operator, whether it counts days or emails.
 *
 * One box rather than one per unit: only the word after it and the ceiling
 * differ, and a second copy would be a second place to fix the next time this
 * box changes.
 *
 * `suffix` is what a reader sees and can change with the operator ("days", "days
 * ago"); `unit` is the fixed word the screen reader hears, so the spoken label
 * does not wobble when the dropdown beside it moves.
 */
function AmountInput({
  id,
  index,
  amount,
  suffix,
  unit = "days",
  max = MAX_RULE_DAYS,
  onChange,
}: {
  id: string
  index: number
  amount: number
  suffix: string
  unit?: string
  max?: number
  onChange: (amount: number) => void
}) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <NumberField
        id={id}
        label={`Number of ${unit} for rule ${index + 1}`}
        labelClassName="sr-only"
        className="w-24 shrink-0 gap-0"
        inputClassName="w-24"
        min={1}
        max={max}
        value={amount}
        onChange={onChange}
      />
      <span className="text-sm text-muted-foreground">{suffix}</span>
    </div>
  )
}

/** A dropdown of fixed choices: a rule's comparison, or the value it compares. */
function ChoiceSelect({
  id,
  value,
  choices,
  placeholder,
  invalid,
  onChange,
  "aria-label": ariaLabel,
}: {
  id?: string
  value: string
  choices: Choice[]
  placeholder?: string
  invalid?: boolean
  onChange: (value: string) => void
  "aria-label": string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className="w-full sm:w-fit"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
