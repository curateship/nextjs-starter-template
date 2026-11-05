import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * A window that asks for one name: a new newsletter, a template, a renamed
 * automation.
 *
 * A FormDialog, not a Dialog: a typed name is work, so every way out asks
 * before throwing it away. Enter submits. The box turns red when it is left
 * empty or a submit finds it empty; saying why is the owner's job, in its
 * `onSubmit`.
 */
export function NameDialog({
  open,
  title,
  description,
  cardTitle,
  inputId,
  value,
  onValueChange,
  maxLength,
  placeholder,
  dirty = Boolean(value.trim()),
  busy,
  submitLabel,
  onSubmit,
  onClose,
  className,
}: {
  open: boolean
  title: string
  description: React.ReactNode
  /** The heading of the card the name box sits in. */
  cardTitle: string
  inputId: string
  value: string
  onValueChange: (value: string) => void
  maxLength: number
  placeholder: string
  /** Whether closing would throw something away. A typed name, by default. */
  dirty?: boolean
  busy: boolean
  submitLabel: string
  onSubmit: () => void
  onClose: () => void
  /** The window's width, when the default is not right. */
  className?: string
}) {
  const [touched, setTouched] = React.useState(false)
  const [attempted, setAttempted] = React.useState(false)

  // Each opening starts clean. State follows a prop, so it adjusts during
  // render, not in an effect.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setTouched(false)
      setAttempted(false)
    }
  }

  const submit = () => {
    if (busy) return
    setAttempted(true)
    onSubmit()
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className={className}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{cardTitle}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor={inputId}>Name</Label>
                  <Input
                    id={inputId}
                    autoFocus
                    maxLength={maxLength}
                    value={value}
                    placeholder={placeholder}
                    onChange={(event) => onValueChange(event.target.value)}
                    onBlur={() => setTouched(true)}
                    aria-invalid={
                      (!value.trim() && (touched || attempted)) || undefined
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return
                      event.preventDefault()
                      submit()
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={submit}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
