import * as React from "react"
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  Trash2Icon,
} from "lucide-react"

import { RichTextEditor } from "@/components/broadcasts/rich-text-editor"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  BROADCAST_BLOCK_META,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"

type ContentChange = (field: string, value: unknown) => void

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
  disabled,
}: {
  id: string
  label: string
  value: number | null
  min: number
  max: number
  onCommit: (value: number | null) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = React.useState(value === null ? "" : String(value))
  const [lastValue, setLastValue] = React.useState(value)

  // Adopt external value changes during render (React's recommended pattern
  // for prop-derived state) so typing in the field is never clobbered.
  if (lastValue !== value) {
    setLastValue(value)
    setDraft(value === null ? "" : String(value))
  }

  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft.trim() === "") {
            onCommit(null)
            return
          }
          const parsed = Number.parseInt(draft, 10)
          if (Number.isNaN(parsed)) {
            setDraft(value === null ? "" : String(value))
            return
          }
          onCommit(Math.max(min, Math.min(max, parsed)))
        }}
      />
    </div>
  )
}

function ColorField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff"}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="size-8 shrink-0 cursor-pointer rounded-md border bg-background p-0.5"
        />
        <Input
          id={id}
          value={value}
          maxLength={7}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  )
}

function AlignmentField({
  value,
  onChange,
  disabled,
}: {
  value: "left" | "center" | "right"
  onChange: (value: "left" | "center" | "right") => void
  disabled?: boolean
}) {
  const options = [
    { value: "left", icon: AlignLeftIcon, label: "Align left" },
    { value: "center", icon: AlignCenterIcon, label: "Align center" },
    { value: "right", icon: AlignRightIcon, label: "Align right" },
  ] as const
  return (
    <div className="grid gap-1">
      <Label>Alignment</Label>
      <div className="flex gap-1">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={value === option.value ? "secondary" : "outline"}
            size="icon"
            aria-label={option.label}
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            <option.icon className="size-4" />
          </Button>
        ))}
      </div>
    </div>
  )
}

function HeaderFields({
  block,
  onContentChange,
  disabled,
}: {
  block: Extract<BroadcastBlock, { kind: "header" }>
  onContentChange: ContentChange
  disabled?: boolean
}) {
  const { content } = block
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Label htmlFor="header-logo-url">Logo image URL</Label>
        <Input
          id="header-logo-url"
          value={content.logoUrl}
          placeholder="https://yourdomain.com/logo.png"
          disabled={disabled}
          onChange={(event) => onContentChange("logoUrl", event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Use a publicly reachable image URL so inboxes can load it.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          id="header-logo-width"
          label="Width (px)"
          value={content.logoWidth}
          min={16}
          max={600}
          disabled={disabled}
          onCommit={(value) => onContentChange("logoWidth", value ?? 120)}
        />
        <NumberField
          id="header-logo-height"
          label="Height (px)"
          value={content.logoHeight}
          min={8}
          max={600}
          disabled={disabled}
          onCommit={(value) => onContentChange("logoHeight", value)}
        />
      </div>
      <AlignmentField
        value={content.alignment}
        disabled={disabled}
        onChange={(value) => onContentChange("alignment", value)}
      />
      <ColorField
        id="header-bg"
        label="Background color"
        value={content.backgroundColor}
        disabled={disabled}
        onChange={(value) => onContentChange("backgroundColor", value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          id="header-padding-top"
          label="Top padding"
          value={content.paddingTop}
          min={0}
          max={120}
          disabled={disabled}
          onCommit={(value) => onContentChange("paddingTop", value ?? 20)}
        />
        <NumberField
          id="header-padding-bottom"
          label="Bottom padding"
          value={content.paddingBottom}
          min={0}
          max={120}
          disabled={disabled}
          onCommit={(value) => onContentChange("paddingBottom", value ?? 20)}
        />
      </div>
    </div>
  )
}

function RichTextFields({
  block,
  onContentChange,
  disabled,
}: {
  block: Extract<BroadcastBlock, { kind: "richText" }>
  onContentChange: ContentChange
  disabled?: boolean
}) {
  const { content } = block
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Label>Content</Label>
        <RichTextEditor
          value={content.htmlContent}
          disabled={disabled}
          onChange={(html) => onContentChange("htmlContent", html)}
        />
        <p className="text-xs text-muted-foreground">
          Personalize with {"{{firstName}}"}, {"{{lastName}}"} and{" "}
          {"{{email}}"}.
        </p>
      </div>
      <ColorField
        id="richtext-bg"
        label="Background color"
        value={content.backgroundColor}
        disabled={disabled}
        onChange={(value) => onContentChange("backgroundColor", value)}
      />
      <NumberField
        id="richtext-padding"
        label="Padding"
        value={content.padding}
        min={0}
        max={120}
        disabled={disabled}
        onCommit={(value) => onContentChange("padding", value ?? 20)}
      />
    </div>
  )
}

function DividerFields({
  block,
  onContentChange,
  disabled,
}: {
  block: Extract<BroadcastBlock, { kind: "divider" }>
  onContentChange: ContentChange
  disabled?: boolean
}) {
  const { content } = block
  return (
    <div className="grid gap-4">
      <ColorField
        id="divider-color"
        label="Line color"
        value={content.color}
        disabled={disabled}
        onChange={(value) => onContentChange("color", value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          id="divider-thickness"
          label="Thickness (px)"
          value={content.thickness}
          min={1}
          max={16}
          disabled={disabled}
          onCommit={(value) => onContentChange("thickness", value ?? 1)}
        />
        <NumberField
          id="divider-width"
          label="Width (%)"
          value={content.width}
          min={10}
          max={100}
          disabled={disabled}
          onCommit={(value) => onContentChange("width", value ?? 100)}
        />
      </div>
      <NumberField
        id="divider-spacing"
        label="Vertical spacing"
        value={content.spacing}
        min={0}
        max={120}
        disabled={disabled}
        onCommit={(value) => onContentChange("spacing", value ?? 20)}
      />
    </div>
  )
}

function FooterFields({
  block,
  onContentChange,
  disabled,
}: {
  block: Extract<BroadcastBlock, { kind: "footer" }>
  onContentChange: ContentChange
  disabled?: boolean
}) {
  const { content } = block
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Label htmlFor="footer-company-name">Company name</Label>
        <Input
          id="footer-company-name"
          value={content.companyName}
          placeholder="Your Company"
          disabled={disabled}
          onChange={(event) =>
            onContentChange("companyName", event.target.value)
          }
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="footer-company-address">Company address</Label>
        <Input
          id="footer-company-address"
          value={content.companyAddress}
          placeholder="123 Main St, City, State"
          disabled={disabled}
          onChange={(event) =>
            onContentChange("companyAddress", event.target.value)
          }
        />
      </div>
      <AlignmentField
        value={content.alignment}
        disabled={disabled}
        onChange={(value) => onContentChange("alignment", value)}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id="footer-show-unsubscribe"
          checked={content.showUnsubscribe}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onContentChange("showUnsubscribe", checked === true)
          }
        />
        <Label htmlFor="footer-show-unsubscribe">Show unsubscribe link</Label>
      </div>
    </div>
  )
}

export function BlockInspector({
  block,
  onContentChange,
  onDelete,
  disabled,
}: {
  block: BroadcastBlock
  onContentChange: ContentChange
  onDelete: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <span className="text-sm font-medium">
          {BROADCAST_BLOCK_META[block.kind].name}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove block"
          title="Remove block"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2Icon className="size-4 text-destructive" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
        {block.kind === "header" ? (
          <HeaderFields
            block={block}
            onContentChange={onContentChange}
            disabled={disabled}
          />
        ) : block.kind === "richText" ? (
          <RichTextFields
            block={block}
            onContentChange={onContentChange}
            disabled={disabled}
          />
        ) : block.kind === "divider" ? (
          <DividerFields
            block={block}
            onContentChange={onContentChange}
            disabled={disabled}
          />
        ) : (
          <FooterFields
            block={block}
            onContentChange={onContentChange}
            disabled={disabled}
          />
        )}
        <Separator className="my-4" />
        <p className="text-xs text-muted-foreground">
          Changes update the preview immediately and are stored when you save.
        </p>
        </div>
      </ScrollArea>
    </div>
  )
}
