"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import X from "lucide-react/dist/esm/icons/x.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import { createSponsorAction, updateSponsorAction, type Sponsor } from "@/lib/actions/sponsors/sponsor-actions"
import { sanitizeUrl } from "@/lib/utils/url-validator"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

interface SponsorFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  sponsor: Sponsor | null
  onSaved: (sponsor: Sponsor) => void
}

export function SponsorFormModal({ open, onOpenChange, siteId, sponsor, onSaved }: SponsorFormModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [url, setUrl] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fieldMissing, setFieldMissing] = useState<"title" | "url" | null>(null)
  // The ring lasts until the box has something in it, so the field stays marked
  // once the toast has been dismissed and clears itself as soon as it is typed in.
  const titleInvalid = fieldMissing === "title" && !title.trim()
  const urlInvalid = fieldMissing === "url" && !url.trim()
  // Failures report through the one shared error toast, never inside the modal
  // body — see workspace/docs/admin-action-feedback.md.
  const setError = (message: string | null) => {
    if (message) showErrorToast(message)
    else dismissErrorToast()
  }
  const [imagePickerOpen, setImagePickerOpen] = useState(false)

  const handleImageChange = (mediaUrl: string) => {
    setImageUrl(mediaUrl)
    setImagePickerOpen(false)
  }

  const handleRemoveImage = () => {
    setImageUrl("")
  }

  useEffect(() => {
    if (!open) return

    setTitle(sponsor?.title || "")
    setDescription(sponsor?.description || "")
    setImageUrl(sponsor?.image_url || "")
    setUrl(sponsor?.url || "")
    setIsActive(sponsor?.is_active ?? true)
    setFieldMissing(null)
    setError(null)
  }, [open, sponsor])

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!title.trim()) {
      setFieldMissing("title")
      setError("Sponsor title is required")
      return
    }

    if (!url.trim()) {
      setFieldMissing("url")
      setError("Sponsor URL is required")
      return
    }

    setFieldMissing(null)
    setSaving(true)
    setError(null)

    const payload = {
      title,
      description,
      image_url: imageUrl,
      url,
      is_active: isActive,
    }

    const result = sponsor
      ? await updateSponsorAction({ data: { sponsorId: sponsor.id, input: payload } })
      : await createSponsorAction({ data: { input: { ...payload, site_id: siteId } } })

    setSaving(false)

    if (result.error || !result.data) {
      setError(result.error || "Failed to save sponsor")
      return
    }

    onSaved(result.data)
    onOpenChange(false)
    showActionSuccess(sponsor ? "Sponsor updated." : "Sponsor created.")
  }

  const safeImageUrl = sanitizeUrl(imageUrl, "")

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
                  <DashboardModalContent
            busy={saving}
            title={sponsor ? "Edit Sponsor" : "Create Sponsor"}
            description="Add the sponsor details used by post embeds."
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button form="sponsor-form" type="submit" disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save Sponsor
                </Button>
              </>
            }
          >
            <form
              noValidate id="sponsor-form" onSubmit={handleSave} className="contents">
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Sponsor details</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="sponsor-title">Title</FieldLabel>
                      <Input
                        id="sponsor-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Acme"
                        aria-invalid={titleInvalid || undefined}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="sponsor-url">URL</FieldLabel>
                      <Input
                        id="sponsor-url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://example.com"
                        aria-invalid={urlInvalid || undefined}
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="sponsor-description">Description</FieldLabel>
                    <Textarea
                      id="sponsor-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Short sponsor description"
                      rows={3}
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Image</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <div className="*:data-[slot=field-label]:w-fit [&>div]:w-fit">
                    {safeImageUrl ? (
                      <div className="relative h-48 w-48 overflow-hidden rounded-lg bg-muted">
                        <img
                          src={safeImageUrl}
                          alt="Sponsor image preview"
                          className="h-full w-full object-contain"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="absolute right-2 top-2 rounded-full bg-destructive p-1 text-destructive-foreground transition-colors hover:bg-destructive/90"
                        >
                          <X className="h-4 w-4" />
                          <span className="sr-only">Remove image</span>
                        </button>
                        <div
                          className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                          onClick={() => setImagePickerOpen(true)}
                        >
                          <div className="text-center text-white">
                            <ImageIcon className="mx-auto mb-2 h-8 w-8" />
                            <p className="text-sm font-medium">Click to change image</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex h-48 w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 p-4 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                        onClick={() => setImagePickerOpen(true)}
                      >
                        <div className="text-center">
                          <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                          <p className="mt-2 text-sm text-muted-foreground">Click to select sponsor image</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Optional image for this sponsor.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Settings</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start gap-3">
                    <Switch id="sponsor-active" checked={isActive} onCheckedChange={setIsActive} />
                    <div>
                      <p className="text-sm font-medium">Active</p>
                      <p className="text-sm text-muted-foreground">Inactive sponsors will not render in public posts.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CardGroup>
            </form>
          </DashboardModalContent>

      </Dialog>

      <MediaPicker
        open={imagePickerOpen}
        onOpenChange={setImagePickerOpen}
        onSelectMedia={handleImageChange}
        currentMediaUrl={imageUrl}
        showVideos={false}
        site_id={siteId}
      />
    </>
  )
}
