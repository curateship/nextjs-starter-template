"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert.js"
import { getAllSitesAction, type Site } from "@/lib/actions/sites/site-actions"
import { applyThemeToSiteAction } from "@/lib/actions/themes/user-theme-actions"

interface ApplyThemeDialogProps {
  templateId: string
  templateName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplied?: () => void
}

export function ApplyThemeDialog({
  templateId,
  templateName,
  open,
  onOpenChange,
  onApplied,
}: ApplyThemeDialogProps) {
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState("")
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      loadSites()
    }
  }, [open])

  const loadSites = async () => {
    try {
      setLoading(true)
      const { data } = await getAllSitesAction()
      setSites(data || [])
    } catch {
      setSites([])
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    if (!selectedSiteId) {
      setError("Please select a site")
      return
    }

    try {
      setApplying(true)
      setError(null)

      const { success, error: applyError } = await applyThemeToSiteAction({ data: { siteId: selectedSiteId, templateId: templateId } })

      if (applyError) {
        setError(applyError)
        return
      }

      if (success) {
        onOpenChange(false)
        setSelectedSiteId("")
        onApplied?.()
      }
    } catch {
      setError("Failed to apply theme")
    } finally {
      setApplying(false)
    }
  }

  const selectedSite = sites.find(s => s.id === selectedSiteId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Apply Theme</DialogTitle>
          <DialogDescription>
            Apply &ldquo;{templateName}&rdquo; to one of your sites. This will replace
            all pages and settings on the target site.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Target Site</Label>
            <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading sites..." : "Select a site"} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name} ({site.subdomain})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSite && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">This will replace all content</p>
                <p className="mt-1">
                  All pages, blocks, and style settings on &ldquo;{selectedSite.name}&rdquo; will
                  be replaced with the template&apos;s content. Tracking scripts and maintenance
                  settings will be preserved.
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={applying || !selectedSiteId}>
            {applying ? "Applying..." : "Apply Theme"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
