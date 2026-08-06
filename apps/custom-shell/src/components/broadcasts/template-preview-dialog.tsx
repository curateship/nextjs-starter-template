import { Loader2Icon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { BroadcastBlock } from "@/lib/broadcasts/blocks"
import { plural } from "@/lib/format/plural"
import { renderBroadcastBlockHtml } from "@/lib/broadcasts/render"

/**
 * What a template actually looks like, before it replaces what you have
 * written. Without it, picking one from a list of names is a guess you can only
 * check by throwing your email away.
 *
 * Drawn with the same renderer the canvas and the send both use, so this is the
 * template rather than an impression of it.
 */
export function TemplatePreviewDialog({
  open,
  onOpenChange,
  name,
  blocks,
  applying,
  onDelete,
  deleting,
  isDefault,
  onToggleDefault,
  settingDefault,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  blocks: BroadcastBlock[]
  /** True while the email it would replace still has something in it. */
  applying: boolean
  /** Left out for a template that cannot be thrown away from here. */
  onDelete?: () => void
  deleting?: boolean
  /** True when new newsletters already start from this one. */
  isDefault?: boolean
  /** Left out when this template cannot be made the starting one from here. */
  onToggleDefault?: () => void
  settingDefault?: boolean
  onApply: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {blocks.length} {plural(blocks.length, "block", "blocks")}.{" "}
            {applying
              ? "Using it swaps out everything currently in the email. The subject line and who it goes to are left alone."
              : "Using it fills the email with these blocks."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="rounded-xl bg-muted/40 p-4">
            <div className="mx-auto max-w-[600px] overflow-hidden rounded-lg bg-white ring-1 ring-black/10">
              {blocks.length === 0 ? (
                <p className="px-6 py-16 text-center text-sm text-neutral-500">
                  This template has nothing in it.
                </p>
              ) : (
                blocks.map((block) => (
                  <div
                    key={block.id}
                    // Links here are part of the picture, not things to follow.
                    className="[&_a]:pointer-events-none"
                    // The HTML comes from our own renderer, over content that
                    // was cleaned when it was saved — never raw user markup.
                    dangerouslySetInnerHTML={{
                      __html: renderBroadcastBlockHtml(block),
                    }}
                  />
                ))
              )}
            </div>
          </div>
          {onToggleDefault ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Starting template</CardTitle>
                <CardDescription>
                  Only one template can do this, so turning it on turns it off
                  for whichever one had it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="default-newsletter-template">
                    Start new newsletters from this
                  </Label>
                  <Switch
                    id="default-newsletter-template"
                    checked={Boolean(isDefault)}
                    disabled={settingDefault || deleting}
                    onCheckedChange={onToggleDefault}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {/* Hard left, so the button that throws the template away can never
              be mistaken for the one that uses it. */}
          {onDelete ? (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              Delete template
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <DisabledReason
            disabled={blocks.length === 0}
            reason="This template has no blocks yet. Add a block before using it."
          >
            <Button
              type="button"
              disabled={blocks.length === 0 || deleting}
              onClick={onApply}
            >
              Use it
            </Button>
          </DisabledReason>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
