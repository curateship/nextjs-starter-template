"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { saveAsThemeAction } from "@/lib/actions/themes/user-theme-actions"

interface SaveAsThemeDialogProps {
  siteId: string
  siteName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function SaveAsThemeDialog({
  siteId,
  siteName,
  open,
  onOpenChange,
  onSaved,
}: SaveAsThemeDialogProps) {
  const [name, setName] = useState(`${siteName} Theme`)
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Theme name is required")
      return
    }

    try {
      setSaving(true)
      setError(null)

      const { data, error: saveError } = await saveAsThemeAction(
        siteId,
        name.trim(),
        description.trim() || undefined
      )

      if (saveError) {
        setError(saveError)
        return
      }

      if (data) {
        onOpenChange(false)
        setName("")
        setDescription("")
        onSaved?.()
      }
    } catch (err) {
      setError("Failed to save theme")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Save as Theme</DialogTitle>
          <DialogDescription>
            Create a reusable theme from this site&apos;s current layout, pages, and settings.
            You can edit and update the theme later using the page builder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="theme-name">Theme Name</Label>
            <Input
              id="theme-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Theme"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="theme-description">Description (optional)</Label>
            <Textarea
              id="theme-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of this theme..."
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Theme"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
