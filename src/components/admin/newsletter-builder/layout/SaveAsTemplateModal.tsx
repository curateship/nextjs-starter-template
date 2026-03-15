"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createTemplate } from "@/lib/actions/newsletters/template-actions"
import { blocksToJson } from "@/components/admin/newsletter-builder/config/useBlockEditor"
import type { NewsletterBlock } from "@/components/admin/newsletter-builder/config/useBlockEditor"

interface SaveAsTemplateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  blocks: NewsletterBlock[]
  siteId: string
}

export function SaveAsTemplateModal({ open, onOpenChange, blocks, siteId }: SaveAsTemplateModalProps) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleOpenChange(open: boolean) {
    if (!open) {
      setName("")
      setError(null)
      setSuccess(false)
    }
    onOpenChange(open)
  }

  async function handleSave() {
    if (!name.trim() || !siteId) return
    setSaving(true)
    setError(null)

    const { error: createError } = await createTemplate({
      siteId,
      name: name.trim(),
      contentBlocks: blocksToJson(blocks),
    })

    if (createError) {
      setError(createError)
      setSaving(false)
      return
    }

    setSaving(false)
    setSuccess(true)
    setTimeout(() => handleOpenChange(false), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[480px] max-w-[95vw] p-10" style={{ width: '480px', maxWidth: '95vw' }}>
        <DialogHeader className="mb-6">
          <DialogTitle>Save as Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {error && (
            <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          {success ? (
            <p className="text-sm text-green-600">Template saved!</p>
          ) : (
            <>
              <div>
                <Label htmlFor="template-save-name">Template Name *</Label>
                <Input
                  id="template-save-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Weekly Newsletter Layout"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving || !name.trim()}>
                  {saving ? "Saving..." : "Save Template"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
