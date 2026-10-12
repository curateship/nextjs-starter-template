import { describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  canChangeField,
  canChangeTaskType,
  cleanFieldValue,
  fieldValueText,
  fillInFirst,
  firstMissingField,
  onlyWhoCanChange,
  valueFromDraft,
  visibleFieldIds,
  type FieldRule,
} from "@/lib/project/task-fields"

const field = (overrides: Partial<FieldRule> & { id: string }): FieldRule => ({
  name: overrides.id,
  kind: "text",
  neededBeforeDone: false,
  neededWhenMade: false,
  whoCanChange: "anyone",
  settings: {},
  ...overrides,
})

const platform = field({
  id: "platform",
  kind: "dropdown",
  settings: { choices: [{ id: "yt", name: "YouTube" }, { id: "tt", name: "TikTok", removed: true }] },
})
const thumbnail = field({
  id: "thumbnail",
  name: "Thumbnail",
  neededBeforeDone: true,
  settings: { showWhen: { fieldId: "platform", choiceId: "yt" } },
})
const finalCut = field({ id: "cut", name: "Final cut", kind: "file", neededBeforeDone: true, neededWhenMade: true })

describe("which fields show", () => {
  it("shows a field only while its dropdown has the choice, and keeps it shown when the link is broken", () => {
    expect(visibleFieldIds([platform, thumbnail], {}).has("thumbnail")).toBe(false)
    expect(visibleFieldIds([platform, thumbnail], { platform: "yt" }).has("thumbnail")).toBe(true)
    expect(visibleFieldIds([thumbnail], {}).has("thumbnail")).toBe(true)
  })

  it("hides a field whose dropdown is itself hidden, and never loops", () => {
    const a = field({ id: "a", kind: "dropdown", settings: { choices: [{ id: "x", name: "X" }], showWhen: { fieldId: "b", choiceId: "y" } } })
    const b = field({ id: "b", kind: "dropdown", settings: { choices: [{ id: "y", name: "Y" }], showWhen: { fieldId: "a", choiceId: "x" } } })
    expect(() => visibleFieldIds([a, b], { a: "x", b: "y" })).not.toThrow()
    const chained = field({ id: "c", settings: { showWhen: { fieldId: "thumbnailPick", choiceId: "z" } } })
    const thumbnailPick = field({
      id: "thumbnailPick",
      kind: "dropdown",
      settings: { choices: [{ id: "z", name: "Z" }], showWhen: { fieldId: "platform", choiceId: "yt" } },
    })
    expect(visibleFieldIds([platform, thumbnailPick, chained], { thumbnailPick: "z" }).has("c")).toBe(false)
    expect(visibleFieldIds([platform, thumbnailPick, chained], { platform: "yt", thumbnailPick: "z" }).has("c")).toBe(true)
  })
})

describe("what must be filled", () => {
  it("names the first empty field that shows, and a hidden one is never needed", () => {
    expect(firstMissingField([platform, thumbnail, finalCut], {}, "done")?.name).toBe("Final cut")
    expect(firstMissingField([platform, thumbnail, finalCut], { platform: "yt" }, "done")?.name).toBe("Thumbnail")
    expect(firstMissingField([platform, thumbnail, finalCut], { cut: 2 }, "done")).toBeNull()
  })

  it("never asks for a file when the task is made", () => {
    expect(firstMissingField([finalCut], {}, "made")).toBeNull()
  })

  it("says the refusals in words the app shows as they are", () => {
    expect(getProjectErrorMessage(new Error(fillInFirst({ name: "Final cut" })))).toBe("Fill in Final cut first.")
    const refusal = onlyWhoCanChange({ name: "Footage link", whoCanChange: "handed_out_by" })!
    expect(getProjectErrorMessage(new Error(refusal))).toBe(refusal)
    expect(getProjectErrorMessage(new Error("Fill in the secret token first because"))).toBe("Something went wrong. Try again.")
  })
})

describe("who can change a field", () => {
  const task = { assigneeUserId: "priya", firstHandedOutByUserId: "leo", createdByUserId: "anna" }
  it("follows the field's rule, with the owner and admins always allowed", () => {
    const assigneeOnly = { whoCanChange: "assignee" as const }
    expect(canChangeField(assigneeOnly, task, { userId: "priya", role: "member" })).toBe(true)
    expect(canChangeField(assigneeOnly, task, { userId: "leo", role: "member" })).toBe(false)
    expect(canChangeField(assigneeOnly, task, { userId: "leo", role: "admin" })).toBe(true)
    const brief = { whoCanChange: "handed_out_by" as const }
    expect(canChangeField(brief, task, { userId: "leo", role: "member" })).toBe(true)
    expect(canChangeField(brief, { ...task, firstHandedOutByUserId: null }, { userId: "anna", role: "member" })).toBe(true)
  })

  it("lets only whoever handed the task out, the owner and admins change its type", () => {
    expect(canChangeTaskType(task, { userId: "leo", role: "member" })).toBe(true)
    expect(canChangeTaskType(task, { userId: "priya", role: "member" })).toBe(false)
    expect(canChangeTaskType(task, { userId: "priya", role: "owner" })).toBe(true)
  })
})

describe("values", () => {
  it("cleans and checks each kind, with empty meaning no value", () => {
    expect(cleanFieldValue("text", "  hi ")).toBe("hi")
    expect(cleanFieldValue("text", "")).toBeNull()
    expect(cleanFieldValue("checkbox", false)).toBeNull()
    expect(() => cleanFieldValue("link", "http://plain.example")).toThrow(PROJECT_ERRORS.fieldLink)
    expect(() => cleanFieldValue("date", "2026-02-31")).toThrow(PROJECT_ERRORS.fieldDate)
    expect(() => cleanFieldValue("number", "12")).toThrow(PROJECT_ERRORS.fieldNumber)
    expect(() => cleanFieldValue("file", "x")).toThrow(PROJECT_ERRORS.fieldValueWrong)
  })

  it("turns what was typed into a value, or the reason it can't be one", () => {
    expect(valueFromDraft("number", "1,200")).toEqual({ error: PROJECT_ERRORS.fieldNumber })
    expect(valueFromDraft("number", " 12.5 ")).toEqual({ value: 12.5 })
    expect(valueFromDraft("link", "example.com")).toEqual({ error: PROJECT_ERRORS.fieldLink })
    expect(valueFromDraft("checkbox", true)).toEqual({ value: true })
    expect(valueFromDraft("dropdown", "")).toEqual({ value: null })
  })

  it("reads a removed choice as it was, marked removed", () => {
    expect(fieldValueText(platform, "tt", new Map())).toBe("TikTok (removed)")
    expect(fieldValueText(platform, "yt", new Map())).toBe("YouTube")
    expect(fieldValueText(field({ id: "p", kind: "person" }), "ben", new Map([["ben", "Ben"]]))).toBe("Ben")
    expect(fieldValueText(finalCut, 2, new Map())).toBe("2 files")
    expect(fieldValueText(field({ id: "t" }), undefined, new Map())).toBeNull()
  })
})
