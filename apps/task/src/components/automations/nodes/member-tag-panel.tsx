import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MEMBER_TAG_MAX_LENGTH } from "@/lib/member-tags"
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"
import {
  MEMBER_TAG_MODES,
  type MemberTagMode,
} from "@/lib/automations/nodes/member-tag"

export default function MemberTagFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const mode: MemberTagMode = MEMBER_TAG_MODES.includes(
    node.settings.mode as MemberTagMode
  )
    ? (node.settings.mode as MemberTagMode)
    : "add"
  const tag = typeof node.settings.tag === "string" ? node.settings.tag : ""
  const setSettings = (settings: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-2">
        <FieldLabel htmlFor={`member-tag-${node.id}-mode`} className="text-xs">
          Change
        </FieldLabel>
        <Select
          value={mode}
          onValueChange={(value) => setSettings({ mode: value })}
        >
          <SelectTrigger
            id={`member-tag-${node.id}-mode`}
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="add">Add a tag</SelectItem>
            <SelectItem value="remove">Remove a tag</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <FieldLabel
          htmlFor={`member-tag-${node.id}-tag`}
          className="text-xs"
          hint={`Saved in lowercase, up to ${MEMBER_TAG_MAX_LENGTH} characters.`}
        >
          Tag
        </FieldLabel>
        <Input
          id={`member-tag-${node.id}-tag`}
          value={tag}
          maxLength={MEMBER_TAG_MAX_LENGTH}
          placeholder="beta"
          onChange={(event) => setSettings({ tag: event.target.value })}
        />
      </div>

      <InspectorNote>
        This changes the member who started the flow. A flow with no member
        stops here rather than changing somebody else.
      </InspectorNote>
    </InspectorCard>
  )
}
