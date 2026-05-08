"use client"

import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { CONTACT_STATUS_OPTIONS } from "@/lib/actions/newsletters/contact-filters"
import { cn } from "@/lib/utils/tailwind"
import {
  SEGMENT_CONTACT_STATUSES,
  type SegmentContactStatus,
  type SegmentDynamicCondition,
  type SegmentDynamicRule,
  type SegmentDynamicRuleOperator,
  type SegmentOpenCountRuleOperator,
  type SegmentTagRuleOperator,
} from "@/lib/actions/newsletters/segment-rules"

export type DynamicConditionForm =
  | { id: string; type: "last_engaged_within_days"; operator: SegmentDynamicRuleOperator; days: string }
  | { id: string; type: "email_open_count"; operator: SegmentOpenCountRuleOperator; times: string }
  | { id: string; type: "tag_match"; operator: SegmentTagRuleOperator; tags: string[] }
  | { id: string; type: "status_match"; operator: SegmentDynamicRuleOperator; status: SegmentContactStatus }
  | { id: string; type: "segment_exclusion"; segmentId: string }

type SegmentDynamicConditionEditorProps = {
  availableTags: string[]
  conditions: DynamicConditionForm[]
  onChange: (conditions: DynamicConditionForm[]) => void
  segmentOptions: Segment[]
}

function makeConditionId() {
  return `condition-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function mapDynamicRuleToForm(rule: SegmentDynamicRule | null | undefined): DynamicConditionForm[] {
  if (!rule) return []

  return rule.conditions.map((condition) => {
    if (condition.type === "last_engaged_within_days") {
      return {
        id: makeConditionId(),
        type: "last_engaged_within_days",
        operator: condition.operator,
        days: String(condition.days),
      }
    }

    if (condition.type === "email_open_count") {
      return {
        id: makeConditionId(),
        type: "email_open_count",
        operator: condition.operator,
        times: String(condition.times),
      }
    }

    if (condition.type === "status_match") {
      return {
        id: makeConditionId(),
        type: "status_match",
        operator: condition.operator,
        status: condition.status,
      }
    }

    if (condition.type === "segment_exclusion") {
      return {
        id: makeConditionId(),
        type: "segment_exclusion",
        segmentId: condition.segment_id,
      }
    }

    return {
      id: makeConditionId(),
      type: "tag_match",
      operator: condition.operator,
      tags: [...condition.tags],
    }
  })
}

export function buildDynamicRuleFromForm(conditions: DynamicConditionForm[]): SegmentDynamicRule | null {
  const normalizedConditions: SegmentDynamicCondition[] = []

  for (const condition of conditions) {
    if (condition.type === "last_engaged_within_days") {
      const days = Number(condition.days)
      if (!Number.isInteger(days) || days < 1) return null
      normalizedConditions.push({
        type: "last_engaged_within_days",
        operator: condition.operator,
        days,
      })
      continue
    }

    if (condition.type === "email_open_count") {
      const times = Number(condition.times)
      if (!Number.isInteger(times) || times < 1) return null
      normalizedConditions.push({
        type: "email_open_count",
        operator: condition.operator,
        times,
      })
      continue
    }

    if (condition.type === "status_match") {
      if (!SEGMENT_CONTACT_STATUSES.includes(condition.status)) return null
      normalizedConditions.push({
        type: "status_match",
        operator: condition.operator,
        status: condition.status,
      })
      continue
    }

    if (condition.type === "segment_exclusion") {
      if (!condition.segmentId) return null
      normalizedConditions.push({
        type: "segment_exclusion",
        segment_id: condition.segmentId,
      })
      continue
    }

    const tags = [...new Set(condition.tags.map((tag) => tag.trim()).filter(Boolean))]
    if (!tags.length) return null
    normalizedConditions.push({
      type: "tag_match",
      operator: condition.operator,
      tags,
    })
  }

  return normalizedConditions.length ? { conditions: normalizedConditions } : null
}

function formatDynamicConditionLabel(condition: DynamicConditionForm) {
  if (condition.type === "last_engaged_within_days") return "Last engaged"
  if (condition.type === "email_open_count") return "Email opens"
  if (condition.type === "status_match") return "Status"
  if (condition.type === "segment_exclusion") return "Segment exclusion"
  return "Tags"
}

export function SegmentDynamicConditionEditor({
  availableTags,
  conditions,
  onChange,
  segmentOptions,
}: SegmentDynamicConditionEditorProps) {
  function addCondition(type: DynamicConditionForm["type"]) {
    if (type === "last_engaged_within_days") {
      onChange([...conditions, { id: makeConditionId(), type, operator: "is", days: "30" }])
      return
    }

    if (type === "email_open_count") {
      onChange([...conditions, { id: makeConditionId(), type, operator: "has_opened", times: "1" }])
      return
    }

    if (type === "status_match") {
      onChange([...conditions, { id: makeConditionId(), type, operator: "is", status: "active" }])
      return
    }

    if (type === "segment_exclusion") {
      onChange([...conditions, { id: makeConditionId(), type, segmentId: "" }])
      return
    }

    onChange([...conditions, { id: makeConditionId(), type, operator: "includes", tags: [] }])
  }

  function updateCondition(conditionId: string, updater: (condition: DynamicConditionForm) => DynamicConditionForm) {
    onChange(conditions.map((condition) => (
      condition.id === conditionId ? updater(condition) : condition
    )))
  }

  function removeCondition(conditionId: string) {
    onChange(conditions.filter((condition) => condition.id !== conditionId))
  }

  function toggleConditionTag(conditionId: string, tag: string) {
    updateCondition(conditionId, (condition) => {
      if (condition.type !== "tag_match") return condition
      return {
        ...condition,
        tags: condition.tags.includes(tag)
          ? condition.tags.filter((existingTag) => existingTag !== tag)
          : [...condition.tags, tag],
      }
    })
  }

  return (
    <div className="pt-4 space-y-4">
      {conditions.length ? (
        conditions.map((condition) => (
          <div key={condition.id} className="rounded-2xl bg-muted/65 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{formatDynamicConditionLabel(condition)}</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => removeCondition(condition.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {condition.type === "last_engaged_within_days" && (
              <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-[140px,1fr]">
                  <Select
                    value={condition.operator}
                    onValueChange={(value: SegmentDynamicRuleOperator) => updateCondition(condition.id, (current) => (
                      current.type === "last_engaged_within_days" ? { ...current, operator: value } : current
                    ))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="is">Is</SelectItem>
                      <SelectItem value="isnt">Isn&apos;t</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={condition.days}
                    onChange={(event) => updateCondition(condition.id, (current) => (
                      current.type === "last_engaged_within_days" ? { ...current, days: event.target.value } : current
                    ))}
                    placeholder="Days"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Contacts are added and removed automatically based on engagement.
                </p>
              </div>
            )}

            {condition.type === "email_open_count" && (
              <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-[170px,1fr]">
                  <Select
                    value={condition.operator}
                    onValueChange={(value: SegmentOpenCountRuleOperator) => updateCondition(condition.id, (current) => (
                      current.type === "email_open_count" ? { ...current, operator: value } : current
                    ))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="has_opened">Opened any of the last</SelectItem>
                      <SelectItem value="hasnt_opened">Opened none of the last</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={condition.times}
                    onChange={(event) => updateCondition(condition.id, (current) => (
                      current.type === "email_open_count" ? { ...current, times: event.target.value } : current
                    ))}
                    placeholder="Emails"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Checks every contact against the latest emails sent from this site.
                </p>
              </div>
            )}

            {condition.type === "status_match" && (
              <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-[140px,1fr]">
                  <Select
                    value={condition.operator}
                    onValueChange={(value: SegmentDynamicRuleOperator) => updateCondition(condition.id, (current) => (
                      current.type === "status_match" ? { ...current, operator: value } : current
                    ))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="is">Is</SelectItem>
                      <SelectItem value="isnt">Isn&apos;t</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={condition.status}
                    onValueChange={(value: SegmentContactStatus) => updateCondition(condition.id, (current) => (
                      current.type === "status_match" ? { ...current, status: value } : current
                    ))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Contacts update automatically when their subscription status changes.
                </p>
              </div>
            )}

            {condition.type === "segment_exclusion" && (
              <div className="space-y-2">
                <Select
                  value={condition.segmentId}
                  onValueChange={(value) => updateCondition(condition.id, (current) => (
                    current.type === "segment_exclusion" ? { ...current, segmentId: value } : current
                  ))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose segment" />
                  </SelectTrigger>
                  <SelectContent>
                    {segmentOptions.map((segment) => (
                      <SelectItem key={segment.id} value={segment.id}>
                        {segment.name}
                      </SelectItem>
                    ))}
                    {condition.segmentId && !segmentOptions.some((segment) => segment.id === condition.segmentId) && (
                      <SelectItem value={condition.segmentId}>
                        Missing segment
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Contacts already in this segment will be excluded.
                </p>
              </div>
            )}

            {condition.type === "tag_match" && (
              <div className="space-y-3">
                <Select
                  value={condition.operator}
                  onValueChange={(value: SegmentTagRuleOperator) => updateCondition(condition.id, (current) => (
                    current.type === "tag_match" ? { ...current, operator: value } : current
                  ))}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="includes">Includes</SelectItem>
                    <SelectItem value="excludes">Excludes</SelectItem>
                  </SelectContent>
                </Select>
                {availableTags.length ? (
                  <ScrollArea className="h-48 rounded-xl border bg-background">
                    <div className="flex flex-wrap gap-2 p-3">
                      {availableTags.map((tag) => {
                        const selected = condition.tags.includes(tag)
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleConditionTag(condition.id, tag)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-sm transition-colors",
                              selected
                                ? "border-foreground text-foreground shadow-sm"
                                : "border-border bg-background text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {tag}
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-xs text-muted-foreground">No tags available yet.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Contacts update automatically when their tags change.
                </p>
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No conditions added yet.
        </div>
      )}

      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline">
              Add Condition
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => addCondition("last_engaged_within_days")}>
              Last engaged
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addCondition("email_open_count")}>
              Email opens
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addCondition("status_match")}>
              Status
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!segmentOptions.length}
              onSelect={() => addCondition("segment_exclusion")}
            >
              Exclude segment
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addCondition("tag_match")}>
              Tags
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
