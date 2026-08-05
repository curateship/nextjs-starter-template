import type * as React from "react"
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  Trash2Icon,
} from "lucide-react"

import {
  ColorField,
  FieldLabel,
  InspectorCard,
  SliderField,
  SwitchField,
} from "@/components/broadcasts/inspector-fields"
import { RichTextEditor } from "@/components/broadcasts/rich-text-editor"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  BROADCAST_BLOCK_META,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import { cn } from "@/lib/utils"

type ContentChange = (field: string, value: unknown) => void

function TextField({
  id,
  label,
  value,
  placeholder,
  help,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  help?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{help}</p>
      ) : null}
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
    { value: "left", icon: AlignLeftIcon, label: "Line it up left" },
    { value: "center", icon: AlignCenterIcon, label: "Put it in the middle" },
    { value: "right", icon: AlignRightIcon, label: "Line it up right" },
  ] as const

  return (
    <div className="grid gap-2.5">
      <FieldLabel>Alignment</FieldLabel>
      <div className="flex gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            title={option.label}
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
              value === option.value
                ? "border-foreground bg-foreground text-background"
                : "border-black/10 bg-background text-muted-foreground hover:border-black/25 hover:text-foreground"
            )}
          >
            <option.icon className="size-4" />
          </button>
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
    <>
      <InspectorCard
        title="Logo"
        description="The picture at the top. It has to be at an address anyone can open, or inboxes cannot load it."
      >
        {/* The app's standard image field, so a logo is picked from — or
            uploaded straight into — the media library rather than pasted in as
            an address. It has to be a real, reachable file either way: inboxes
            fetch it from a machine that is not yours. */}
        <ImageUpload
          label="Logo"
          showLabel={false}
          value={content.logoUrl}
          disabled={disabled}
          // Contain, not cover: a logo cropped to fill a box is a ruined logo.
          fit="contain"
          emptyLabel="Choose a logo"
          onChange={(value) => onContentChange("logoUrl", value)}
        />
        <SliderField
          id="header-logo-width"
          label="Width"
          value={content.logoWidth}
          min={16}
          max={600}
          disabled={disabled}
          onChange={(value) => onContentChange("logoWidth", value)}
        />
        {/* Null means "work it out from the width", which is right for almost
            every logo — so the height is a thing you switch on, not a box
            sitting there asking to be filled in. */}
        <SwitchField
          id="header-logo-fixed-height"
          label="Set the height too"
          description="Off, it keeps the picture's own proportions."
          checked={content.logoHeight !== null}
          disabled={disabled}
          onChange={(checked) =>
            onContentChange("logoHeight", checked ? content.logoWidth : null)
          }
        />
        {content.logoHeight === null ? null : (
          <SliderField
            id="header-logo-height"
            label="Height"
            value={content.logoHeight}
            min={8}
            max={600}
            disabled={disabled}
            onChange={(value) => onContentChange("logoHeight", value)}
          />
        )}
        <AlignmentField
          value={content.alignment}
          disabled={disabled}
          onChange={(value) => onContentChange("alignment", value)}
        />
      </InspectorCard>

      <InspectorCard title="Spacing">
        <SliderField
          id="header-padding-top"
          label="Space above"
          value={content.paddingTop}
          min={0}
          max={120}
          disabled={disabled}
          onChange={(value) => onContentChange("paddingTop", value)}
        />
        <SliderField
          id="header-padding-bottom"
          label="Space below"
          value={content.paddingBottom}
          min={0}
          max={120}
          disabled={disabled}
          onChange={(value) => onContentChange("paddingBottom", value)}
        />
      </InspectorCard>

      <InspectorCard title="Appearance">
        <ColorField
          label="Background"
          value={content.backgroundColor}
          disabled={disabled}
          onChange={(value) => onContentChange("backgroundColor", value)}
        />
      </InspectorCard>
    </>
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
    <>
      <InspectorCard
        title="Copy"
        description="Write the words here. Drop in one of the tags underneath to make it read like it was written to that person."
      >
        <RichTextEditor
          value={content.htmlContent}
          disabled={disabled}
          onChange={(html) => onContentChange("htmlContent", html)}
        />
      </InspectorCard>

      <InspectorCard title="Spacing">
        <SliderField
          id="richtext-padding"
          label="Space around it"
          value={content.padding}
          min={0}
          max={120}
          disabled={disabled}
          onChange={(value) => onContentChange("padding", value)}
        />
      </InspectorCard>

      <InspectorCard title="Appearance">
        <ColorField
          label="Background"
          value={content.backgroundColor}
          disabled={disabled}
          onChange={(value) => onContentChange("backgroundColor", value)}
        />
      </InspectorCard>
    </>
  )
}

function ButtonFields({
  block,
  onContentChange,
  disabled,
  lockedUrl,
}: {
  block: Extract<BroadcastBlock, { kind: "button" }>
  onContentChange: ContentChange
  disabled?: boolean
  /**
   * True in one of the app's own emails. The whole point of those emails is the
   * link, it is built fresh with a one-use token every time, and it is not
   * anybody's to change — so the address field is not shown at all rather than
   * shown and refused.
   */
  lockedUrl?: boolean
}) {
  const { content } = block
  return (
    <>
      <InspectorCard
        title="The button"
        description="One clear thing to press. Keep the words to what happens when they press it."
      >
        <TextField
          id="button-label"
          label="Words on it"
          value={content.label}
          placeholder="Open"
          disabled={disabled}
          onChange={(value) => onContentChange("label", value)}
        />
        {lockedUrl ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
            This button goes to the link the app makes for each person. That
            cannot be changed here — it is the whole reason the email is sent.
          </p>
        ) : (
          <TextField
            id="button-url"
            label="Where it goes"
            value={content.url}
            placeholder="https://example.com/page"
            help="The full address, starting with https://"
            disabled={disabled}
            onChange={(value) => onContentChange("url", value)}
          />
        )}
        <AlignmentField
          value={content.alignment}
          disabled={disabled}
          onChange={(value) => onContentChange("alignment", value)}
        />
      </InspectorCard>

      <InspectorCard title="Spacing">
        <SliderField
          id="button-padding"
          label="Space around it"
          value={content.padding}
          min={0}
          max={120}
          disabled={disabled}
          onChange={(value) => onContentChange("padding", value)}
        />
        <SliderField
          id="button-radius"
          label="Rounded corners"
          value={content.borderRadius}
          min={0}
          max={40}
          disabled={disabled}
          onChange={(value) => onContentChange("borderRadius", value)}
        />
      </InspectorCard>

      <InspectorCard title="Appearance">
        <ColorField
          label="Button colour"
          value={content.backgroundColor}
          disabled={disabled}
          onChange={(value) => onContentChange("backgroundColor", value)}
        />
        <ColorField
          label="Text colour"
          value={content.textColor}
          disabled={disabled}
          onChange={(value) => onContentChange("textColor", value)}
        />
      </InspectorCard>
    </>
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
    <>
      <InspectorCard
        title="The line"
        description="A rule across the email, for putting a gap between two things that are not about each other."
      >
        <SliderField
          id="divider-thickness"
          label="Thickness"
          value={content.thickness}
          min={1}
          max={16}
          disabled={disabled}
          onChange={(value) => onContentChange("thickness", value)}
        />
        <SliderField
          id="divider-width"
          label="How far across"
          value={content.width}
          min={10}
          max={100}
          unit="%"
          disabled={disabled}
          onChange={(value) => onContentChange("width", value)}
        />
      </InspectorCard>

      <InspectorCard title="Spacing">
        <SliderField
          id="divider-spacing"
          label="Space above and below"
          value={content.spacing}
          min={0}
          max={120}
          disabled={disabled}
          onChange={(value) => onContentChange("spacing", value)}
        />
      </InspectorCard>

      <InspectorCard title="Appearance">
        <ColorField
          label="Line colour"
          value={content.color}
          disabled={disabled}
          onChange={(value) => onContentChange("color", value)}
        />
      </InspectorCard>
    </>
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
    <>
      <InspectorCard
        title="Small print"
        description="The bit at the bottom saying who sent this and how to stop getting it."
      >
        <TextField
          id="footer-company-name"
          label="Company name"
          value={content.companyName}
          placeholder="Your company"
          disabled={disabled}
          onChange={(value) => onContentChange("companyName", value)}
        />
        <TextField
          id="footer-company-address"
          label="Postal address"
          value={content.companyAddress}
          placeholder="123 Main St, City"
          disabled={disabled}
          onChange={(value) => onContentChange("companyAddress", value)}
        />
        <AlignmentField
          value={content.alignment}
          disabled={disabled}
          onChange={(value) => onContentChange("alignment", value)}
        />
      </InspectorCard>

      <InspectorCard title="Unsubscribe">
        <SwitchField
          id="footer-show-unsubscribe"
          label="Show the unsubscribe link"
          description="With no way out, inboxes are far more likely to treat the whole send as junk."
          checked={content.showUnsubscribe}
          disabled={disabled}
          onChange={(checked) => onContentChange("showUnsubscribe", checked)}
        />
      </InspectorCard>
    </>
  )
}

/**
 * The right panel.
 *
 * With a block selected it shows that block's options. With nothing selected it
 * shows the email's own settings, so the middle panel can stay purely the email
 * and there is no separate place to go looking for the subject line.
 */
export function BlockInspector({
  block,
  editingDefault,
  fields,
  disabled,
  lockedButtonUrl,
  settingsExtra,
  onContentChange,
  onFieldChange,
  onDelete,
}: {
  block: BroadcastBlock | null
  /**
   * True when the block on show came from the left panel and is in no email —
   * so what is being edited is how new blocks of that kind start out, not a
   * block anyone is reading. The panel has to say so, or these edits look like
   * they have quietly gone missing from the email.
   */
  editingDefault?: boolean
  fields: {
    subject: string
    preheader: string
    fromName: string
  }
  disabled?: boolean
  /** True in the app's own emails, where the button's target is not editable. */
  lockedButtonUrl?: boolean
  /**
   * The last card with nothing selected. A newsletter puts who it goes to
   * there; one of the app's own emails puts the placeholders it can use. Both
   * are about the email as a whole, which is what this panel shows when no
   * single block is picked.
   */
  settingsExtra?: React.ReactNode
  onContentChange: ContentChange
  onFieldChange: (
    field: "subject" | "preheader" | "fromName",
    value: string
  ) => void
  onDelete: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-foreground/10 px-3">
        <span className="truncate text-sm font-medium">
          {block ? BROADCAST_BLOCK_META[block.kind].name : "Email settings"}
        </span>
        {block ? (
          <DisabledReason
            disabled={Boolean(disabled)}
            reason="Finish saving this block before removing it."
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={editingDefault ? "Close this block" : "Remove this block"}
              disabled={disabled}
              onClick={onDelete}
            >
              {/* Nothing is destroyed by closing a block that is in no email, so
                  it does not get the red bin. */}
              <Trash2Icon
                className={cn("size-4", !editingDefault && "text-destructive")}
              />
            </Button>
          </DisabledReason>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          {block && editingDefault ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              This block is not in the email. What you change here is how every
              new {BROADCAST_BLOCK_META[block.kind].name} block starts out — use
              the plus in the left panel to put one in.
            </p>
          ) : null}
          {block === null ? (
            <EmailSettingsFields
              fields={fields}
              disabled={disabled}
              settingsExtra={settingsExtra}
              onFieldChange={onFieldChange}
            />
          ) : block.kind === "header" ? (
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
          ) : block.kind === "button" ? (
            <ButtonFields
              block={block}
              onContentChange={onContentChange}
              disabled={disabled}
              lockedUrl={lockedButtonUrl}
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
          {block ? (
            <p className="px-1 pb-1 text-sm text-muted-foreground">
              Click any block in the email to edit that block instead.
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function EmailSettingsFields({
  fields,
  disabled,
  settingsExtra,
  onFieldChange,
}: {
  fields: {
    subject: string
    preheader: string
    fromName: string
  }
  disabled?: boolean
  settingsExtra?: React.ReactNode
  onFieldChange: (
    field: "subject" | "preheader" | "fromName",
    value: string
  ) => void
}) {
  return (
    <>
      <InspectorCard
        title="Subject"
        description="What people see in their inbox before they open anything."
      >
        <TextField
          id="broadcast-subject"
          label="Subject line"
          value={fields.subject}
          placeholder="What this email is about…"
          disabled={disabled}
          onChange={(value) => onFieldChange("subject", value)}
        />
        <TextField
          id="broadcast-preheader"
          label="Preview line"
          value={fields.preheader}
          placeholder="The grey line shown next to the subject"
          disabled={disabled}
          onChange={(value) => onFieldChange("preheader", value)}
        />
      </InspectorCard>

      <InspectorCard title="Sender">
        <TextField
          id="broadcast-from-name"
          label="From name"
          value={fields.fromName}
          placeholder="Leave blank to use the workspace default"
          disabled={disabled}
          onChange={(value) => onFieldChange("fromName", value)}
        />
      </InspectorCard>

      {settingsExtra}

      <p className="px-1 pb-1 text-sm text-muted-foreground">
        Click any block in the email to edit that block instead.
      </p>
    </>
  )
}
