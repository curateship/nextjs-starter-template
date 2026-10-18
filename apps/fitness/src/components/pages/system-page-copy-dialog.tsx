import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ShellConfig } from "@/lib/custom-shell"
import {
  MAX_PUBLIC_SYSTEM_BODY_LENGTH,
  MAX_PUBLIC_SYSTEM_HEADING_LENGTH,
  resolveMaintenanceCopy,
  resolveNotFoundCopy,
  type PublicSystemCopy,
} from "@/lib/pages/public-metadata"

/**
 * The two pages the shell draws itself whose words an admin may change: the
 * one a dead link lands on, and the one the whole app is behind while it is
 * closed.
 *
 * Keyed by address, because that is how the Pages screen knows a page. Both
 * read their words out of the same saved pair of fields, so the dialog below
 * works out which pair from the address alone.
 */
export const SYSTEM_PAGE_COPY = {
  "/404": {
    title: "Page not found",
    description:
      "What a visitor sees when a link is dead or an address was mistyped.",
    headingField: "notFoundHeading",
    bodyField: "notFoundBody",
    resolve: (copy: PublicSystemCopy) => resolveNotFoundCopy(copy),
  },
  "/maintenance": {
    title: "Maintenance",
    description:
      "What everyone sees while the app is closed. Switching maintenance on is a different control, in General settings.",
    headingField: "maintenanceHeading",
    bodyField: "maintenanceBody",
    resolve: (copy: PublicSystemCopy) => resolveMaintenanceCopy(copy),
  },
} as const satisfies Record<
  string,
  {
    title: string
    description: string
    headingField: keyof PublicSystemCopy
    bodyField: keyof PublicSystemCopy
    resolve: (copy: PublicSystemCopy) => { heading: string; body: string }
  }
>

/** Whether this address is a page whose words can be changed on this screen. */
export function hasSystemPageCopy(
  path: string
): path is keyof typeof SYSTEM_PAGE_COPY {
  return path in SYSTEM_PAGE_COPY
}

/**
 * Changing the words on a page the shell draws itself.
 *
 * **It opens from the Pages list rather than from Settings.** The words a
 * visitor reads on a page are that page's content, and the place an admin goes
 * to work on a page is the Pages screen. They were a settings card until
 * 4 October 2026, which meant a page was listed in one place and written in
 * another.
 *
 * Empty is not blank: a field left empty uses the shell's own wording, and the
 * preview underneath shows what a visitor actually gets either way.
 */
export function SystemPageCopyDialog({
  path,
  config,
  onClose,
  onSave,
}: {
  /** The page being edited, or null when the window is shut. */
  path: keyof typeof SYSTEM_PAGE_COPY | null
  config: ShellConfig
  onClose: () => void
  onSave: (copy: PublicSystemCopy) => void
}) {
  const page = path ? SYSTEM_PAGE_COPY[path] : null
  const savedHeading = page
    ? (config.publicSystemCopy[page.headingField] as string)
    : ""
  const savedBody = page ? (config.publicSystemCopy[page.bodyField] as string) : ""

  const [heading, setHeading] = React.useState(savedHeading)
  const [body, setBody] = React.useState(savedBody)

  // Reset to whatever the window was opened on, so a second open never shows
  // the last page's words.
  const [openedFor, setOpenedFor] = React.useState<string | null>(path)
  if (openedFor !== path) {
    setOpenedFor(path)
    setHeading(savedHeading)
    setBody(savedBody)
  }

  const dirty = heading !== savedHeading || body !== savedBody

  // What a visitor gets with the words as they stand, which is the shell's own
  // wording wherever a field is empty.
  const preview = page
    ? page.resolve({
        ...config.publicSystemCopy,
        [page.headingField]: heading,
        [page.bodyField]: body,
      })
    : { heading: "", body: "" }

  return (
    <FormDialog open={path !== null} dirty={dirty} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{page?.title ?? "Page"}</DialogTitle>
            <DialogDescription>{page?.description}</DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>What it says</CardTitle>
                <CardDescription>
                  Leave a field empty and the page uses the shell's own wording.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="system-page-heading">Heading</FieldLabel>
                  <Input
                    id="system-page-heading"
                    value={heading}
                    maxLength={MAX_PUBLIC_SYSTEM_HEADING_LENGTH}
                    placeholder={preview.heading}
                    onChange={(event) => setHeading(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="system-page-body"
                    hint="Plain text only. A page a visitor lands on by accident is not the place for a layout."
                  >
                    Message
                  </FieldLabel>
                  <Textarea
                    id="system-page-body"
                    rows={1}
                    value={body}
                    maxLength={MAX_PUBLIC_SYSTEM_BODY_LENGTH}
                    placeholder={preview.body}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </div>
                <div className="grid gap-1 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Preview</p>
                  <p className="text-sm font-medium">{preview.heading}</p>
                  <p className="text-sm text-muted-foreground">{preview.body}</p>
                </div>
              </CardContent>
            </Card>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!page) return
                onSave({
                  ...config.publicSystemCopy,
                  [page.headingField]: heading,
                  [page.bodyField]: body,
                })
              }}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
