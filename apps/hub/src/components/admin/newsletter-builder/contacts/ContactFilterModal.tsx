"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { CalendarIcon, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { cn } from "@/lib/utils/tailwind"
import { getContactsWithStats } from "@/lib/actions/newsletters/contact-actions"
import {
  cloneContactFilterGroup,
  CONTACT_DATA_FIELD_OPERATOR_OPTIONS,
  CONTACT_DATA_FIELD_OPTIONS,
  CONTACT_EMAIL_OPEN_OPERATOR_OPTIONS,
  CONTACT_FILTER_TYPE_OPTIONS,
  CONTACT_RELATIVE_DAY_OPTIONS,
  CONTACT_SOURCE_OPTIONS,
  CONTACT_STATUS_OPTIONS,
  createContactFilterRule,
  emptyContactFilterGroup,
  getContactFilterTypeLabel,
  pruneContactFilterGroup,
  type ContactDataField,
  type ContactDataFieldOperator,
  type ContactEmailOpenOperator,
  type ContactFilterGroup,
  type ContactFilterRule,
  type ContactFilterType,
} from "@/lib/actions/newsletters/contact-filters"

type ContactFilterModalProps = {
  filters: ContactFilterGroup
  onApply: (filters: ContactFilterGroup) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  pageSize: number
  searchQuery: string
  siteId?: string | null
  total: number
}

function makeFilterRuleId() {
  return `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function toCalendarDate(value: string | null) {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function fromCalendarDate(value: Date | undefined) {
  return value
    ? new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0)).toISOString()
    : null
}

function formatDatePickerLabel(value: string | null, placeholder: string) {
  const date = toCalendarDate(value)
  return date ? format(date, "MMM d, yyyy") : placeholder
}

function buildPendingDataFieldInputs(group: ContactFilterGroup) {
  return group.rules.reduce<Record<string, string>>((acc, rule) => {
    if (rule.type === "dataField") {
      acc[rule.id] = rule.value
    }
    return acc
  }, {})
}

function isDateRule(rule: ContactFilterRule): rule is Extract<ContactFilterRule, { type: "lastEngaged" | "dateAdded" }> {
  return rule.type === "lastEngaged" || rule.type === "dateAdded"
}

function isValueRule(rule: ContactFilterRule): rule is Extract<ContactFilterRule, { type: "status" | "source" }> {
  return rule.type === "status" || rule.type === "source"
}

function isEmailOpenRule(rule: ContactFilterRule): rule is Extract<ContactFilterRule, { type: "emailOpens" }> {
  return rule.type === "emailOpens"
}

function shouldShowDataFieldValueInput(operator: ContactDataFieldOperator) {
  return operator !== "isEmpty" && operator !== "isNotEmpty"
}

function buildNormalizedFilterGroup(
  group: ContactFilterGroup,
  dataFieldInputs: Record<string, string>
) {
  return pruneContactFilterGroup({
    ...cloneContactFilterGroup(group),
    rules: group.rules.map((rule) => {
      if (rule.type !== "dataField") return rule
      return {
        ...rule,
        value: (dataFieldInputs[rule.id] ?? rule.value).trim(),
      }
    }),
  })
}

export function ContactFilterModal({
  filters,
  onApply,
  onOpenChange,
  open,
  pageSize,
  searchQuery,
  siteId,
  total,
}: ContactFilterModalProps) {
  const [pendingFilters, setPendingFilters] = useState<ContactFilterGroup>(emptyContactFilterGroup)
  const [pendingDataFieldInputs, setPendingDataFieldInputs] = useState<Record<string, string>>({})
  const [pendingFilteredTotal, setPendingFilteredTotal] = useState(0)

  useEffect(() => {
    if (!open) return
    const clonedFilters = cloneContactFilterGroup(filters)
    setPendingFilters(clonedFilters)
    setPendingDataFieldInputs(buildPendingDataFieldInputs(clonedFilters))
    setPendingFilteredTotal(clonedFilters.rules.length ? total : 0)
  }, [filters, open, total])

  useEffect(() => {
    if (!open || !siteId) {
      setPendingFilteredTotal(0)
      return
    }

    const previewFilters = buildNormalizedFilterGroup(pendingFilters, pendingDataFieldInputs)
    if (!previewFilters.rules.length) {
      setPendingFilteredTotal(0)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      const result = await getContactsWithStats(siteId, {
        filterGroup: previewFilters,
        searchQuery,
        page: 1,
        pageSize,
      })

      if (cancelled) return
      setPendingFilteredTotal(result.error ? 0 : result.total)
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [open, pageSize, pendingDataFieldInputs, pendingFilters, searchQuery, siteId])

  function addPendingFilter(type: ContactFilterType) {
    const rule = createContactFilterRule(makeFilterRuleId(), type)
    setPendingFilters((prev) => ({
      ...prev,
      rules: [...prev.rules, rule],
    }))
    if (type === "dataField") {
      setPendingDataFieldInputs((prev) => ({ ...prev, [rule.id]: "" }))
    }
  }

  function updatePendingRule(ruleId: string, updater: (rule: ContactFilterRule) => ContactFilterRule) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => (rule.id === ruleId ? updater(rule) : rule)),
    }))
  }

  function removePendingRule(ruleId: string) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.filter((rule) => rule.id !== ruleId),
    }))
    setPendingDataFieldInputs((prev) => {
      if (!(ruleId in prev)) return prev
      const next = { ...prev }
      delete next[ruleId]
      return next
    })
  }

  function togglePendingValue(ruleId: string, value: string) {
    updatePendingRule(ruleId, (rule) => {
      if (!isValueRule(rule)) return rule
      return {
        ...rule,
        value: rule.value.includes(value)
          ? rule.value.filter((item) => item !== value)
          : [...rule.value, value],
      }
    })
  }

  function updatePendingDataFieldOperator(ruleId: string, operator: ContactDataFieldOperator) {
    updatePendingRule(ruleId, (rule) => {
      if (rule.type !== "dataField") return rule
      return { ...rule, operator }
    })
  }

  function updatePendingDataFieldField(ruleId: string, field: ContactDataField) {
    updatePendingRule(ruleId, (rule) => {
      if (rule.type !== "dataField") return rule
      return { ...rule, field }
    })
  }

  function updatePendingDataFieldValues(ruleId: string, inputValue: string) {
    setPendingDataFieldInputs((prev) => ({ ...prev, [ruleId]: inputValue }))
  }

  function updatePendingDateOperator(ruleId: string, operator: "is" | "isnt") {
    updatePendingRule(ruleId, (rule) => {
      if (!isDateRule(rule)) return rule
      return { ...rule, operator }
    })
  }

  function updatePendingDateValue(ruleId: string, nextValue: string) {
    updatePendingRule(ruleId, (rule) => {
      if (!isDateRule(rule)) return rule
      if (nextValue === "custom") {
        return {
          ...rule,
          value: { mode: "range", from: null, to: null },
        }
      }

      const days = Number(nextValue) as 7 | 30 | 60 | 90
      return {
        ...rule,
        value: { mode: "relative", days },
      }
    })
  }

  function updatePendingDateRange(ruleId: string, boundary: "from" | "to", selectedDate: Date | undefined) {
    updatePendingRule(ruleId, (rule) => {
      if (!isDateRule(rule)) return rule
      const currentRange = rule.value.mode === "range" ? rule.value : { mode: "range" as const, from: null, to: null }
      return {
        ...rule,
        value: {
          ...currentRange,
          [boundary]: fromCalendarDate(selectedDate),
        },
      }
    })
  }

  function updatePendingEmailOpenOperator(ruleId: string, operator: ContactEmailOpenOperator) {
    updatePendingRule(ruleId, (rule) => {
      if (!isEmailOpenRule(rule)) return rule
      return { ...rule, operator }
    })
  }

  function updatePendingEmailOpenTimes(ruleId: string, times: string) {
    updatePendingRule(ruleId, (rule) => {
      if (!isEmailOpenRule(rule)) return rule
      return { ...rule, times }
    })
  }

  function clearPendingFilters() {
    setPendingFilters(emptyContactFilterGroup())
    setPendingDataFieldInputs({})
    setPendingFilteredTotal(0)
  }

  function applyFilters() {
    onApply(buildNormalizedFilterGroup(pendingFilters, pendingDataFieldInputs))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DashboardModalContent
        title="Filter Contacts"
        description="Build rules to narrow the contacts shown in this dashboard."
        footer={
          <>
            <button
              type="button"
              onClick={clearPendingFilters}
              className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
            >
              Clear all ({pendingFilteredTotal})
            </button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={applyFilters}>
                Apply Filters
              </Button>
            </div>
          </>
        }
        footerClassName="sm:justify-between"
      >
        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Filter rules</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
          <div className="flex items-center gap-3 text-sm font-medium">
            <span>Matching</span>
            <Tabs
              value={pendingFilters.match}
              onValueChange={(match) => {
                if (match === "all" || match === "any") {
                  setPendingFilters((prev) => ({ ...prev, match }))
                }
              }}
            >
              <TabsList className="h-11 rounded-lg bg-muted/70 p-1">
                <TabsTrigger value="all" className="rounded-md px-4 py-2">
                  all
                </TabsTrigger>
                <TabsTrigger value="any" className="rounded-md px-4 py-2">
                  any
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span>of these:</span>
          </div>

          {pendingFilters.rules.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No filters added yet.
            </div>
          ) : (
            pendingFilters.rules.map((rule) => (
              <div key={rule.id} className="rounded-2xl bg-muted/65 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{getContactFilterTypeLabel(rule.type)}</h3>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removePendingRule(rule.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {rule.type === "status" && (
                  <div className="flex flex-wrap gap-3">
                    {CONTACT_STATUS_OPTIONS.map((option) => {
                      const isActive = rule.value.includes(option.value)
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => togglePendingValue(rule.id, option.value)}
                          className={cn(
                            "rounded-full border px-5 py-3 text-sm transition-colors",
                            isActive
                              ? "border-foreground text-foreground shadow-sm"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {rule.type === "source" && (
                  <div className="flex flex-wrap gap-3">
                    {CONTACT_SOURCE_OPTIONS.map((option) => {
                      const isActive = rule.value.includes(option.value)
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => togglePendingValue(rule.id, option.value)}
                          className={cn(
                            "rounded-full border px-5 py-3 text-sm transition-colors",
                            isActive
                              ? "border-foreground text-foreground shadow-sm"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {rule.type === "dataField" && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select value={rule.field} onValueChange={(value: ContactDataField) => updatePendingDataFieldField(rule.id, value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTACT_DATA_FIELD_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={rule.operator}
                        onValueChange={(value: ContactDataFieldOperator) => updatePendingDataFieldOperator(rule.id, value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTACT_DATA_FIELD_OPERATOR_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {shouldShowDataFieldValueInput(rule.operator) && (
                      <Input
                        value={pendingDataFieldInputs[rule.id] ?? rule.value}
                        onChange={(event) => updatePendingDataFieldValues(rule.id, event.target.value)}
                        placeholder="Type any value"
                      />
                    )}
                  </div>
                )}

                {rule.type === "emailOpens" && (
                  <div className="space-y-2">
                    <div className="grid gap-3 sm:grid-cols-[170px,1fr]">
                      <Select
                        value={rule.operator}
                        onValueChange={(value: ContactEmailOpenOperator) => updatePendingEmailOpenOperator(rule.id, value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTACT_EMAIL_OPEN_OPERATOR_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={rule.times}
                        onChange={(event) => updatePendingEmailOpenTimes(rule.id, event.target.value)}
                        placeholder="Emails"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Checks every contact against the latest emails sent from this site.
                    </p>
                  </div>
                )}

                {isDateRule(rule) && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-[140px,1fr]">
                      <Select value={rule.operator} onValueChange={(value: "is" | "isnt") => updatePendingDateOperator(rule.id, value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="is">Is</SelectItem>
                          <SelectItem value="isnt">Isn&apos;t</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={rule.value.mode === "relative" ? String(rule.value.days) : "custom"}
                        onValueChange={(value) => updatePendingDateValue(rule.id, value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTACT_RELATIVE_DAY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)}>
                              {option.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom range</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {rule.value.mode === "range" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label htmlFor={`${rule.id}-from`} className="text-xs text-muted-foreground">Start date</label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                id={`${rule.id}-from`}
                                type="button"
                                variant="outline"
                                className={cn(
                                  "w-full justify-between font-normal",
                                  !rule.value.from && "text-muted-foreground"
                                )}
                              >
                                {formatDatePickerLabel(rule.value.from, "Pick a start date")}
                                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarPicker
                                mode="single"
                                selected={toCalendarDate(rule.value.from)}
                                onSelect={(date) => updatePendingDateRange(rule.id, "from", date)}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                          <label htmlFor={`${rule.id}-to`} className="text-xs text-muted-foreground">End date</label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                id={`${rule.id}-to`}
                                type="button"
                                variant="outline"
                                className={cn(
                                  "w-full justify-between font-normal",
                                  !rule.value.to && "text-muted-foreground"
                                )}
                              >
                                {formatDatePickerLabel(rule.value.to, "Pick an end date")}
                                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarPicker
                                mode="single"
                                selected={toCalendarDate(rule.value.to)}
                                onSelect={(date) => updatePendingDateRange(rule.id, "to", date)}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  Add filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {CONTACT_FILTER_TYPE_OPTIONS.map((option) => (
                  <DropdownMenuItem key={option.value} onSelect={() => addPendingFilter(option.value)}>
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
    </Dialog>
  )
}
