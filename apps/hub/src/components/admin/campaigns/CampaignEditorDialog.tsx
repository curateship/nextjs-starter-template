"use client"

import { useEffect, useState } from "react"
import { ImageIcon } from "lucide-react"

import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { saveCampaignAction } from "@/lib/actions/campaigns/campaign-actions"
import type { CampaignInput, CampaignRecord, PopupCampaignContent } from "@/lib/campaigns/campaigns"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"

type FormState = {
  name: string
  type: "bar" | "popup"
  barText: string
  heading: string
  bodyText: string
  imageUrl: string
  goal: "link" | "email"
  ctaLabel: string
  ctaUrl: string
  submitLabel: string
  successMessage: string
  targetingMode: "all" | "include" | "exclude"
  targetPaths: string
  triggerType: "delay" | "scroll" | "exit_intent"
  triggerValue: string
  frequency: CampaignInput["frequency"]
  startsAt: string
  endsAt: string
  status: CampaignInput["status"]
}

const EMPTY_FORM: FormState = {
  name: "",
  type: "bar",
  barText: "",
  heading: "",
  bodyText: "",
  imageUrl: "",
  goal: "link",
  ctaLabel: "",
  ctaUrl: "",
  submitLabel: "Subscribe",
  successMessage: "Thanks for subscribing.",
  targetingMode: "all",
  targetPaths: "",
  triggerType: "delay",
  triggerValue: "5",
  frequency: "once_per_visitor",
  startsAt: "",
  endsAt: "",
  status: "draft",
}

function toLocalDateTime(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formFromCampaign(campaign: CampaignRecord | null): FormState {
  if (!campaign) return EMPTY_FORM
  const popup = campaign.type === "popup" ? campaign.content as PopupCampaignContent : null
  return {
    ...EMPTY_FORM,
    name: campaign.name,
    type: campaign.type,
    barText: campaign.type === "bar" ? campaign.content.text : "",
    heading: popup?.heading ?? "",
    bodyText: popup?.text ?? "",
    imageUrl: popup?.imageUrl ?? "",
    goal: popup?.goal ?? "link",
    ctaLabel: campaign.content.ctaLabel ?? "",
    ctaUrl: campaign.content.ctaUrl ?? "",
    submitLabel: popup?.submitLabel ?? "Subscribe",
    successMessage: popup?.successMessage ?? "Thanks for subscribing.",
    targetingMode: campaign.targeting.mode,
    targetPaths: campaign.targeting.paths.join("\n"),
    triggerType: campaign.type === "popup" && campaign.trigger.type !== "immediate" ? campaign.trigger.type : "delay",
    triggerValue: campaign.trigger.value == null ? "5" : String(campaign.trigger.value),
    frequency: campaign.frequency,
    startsAt: toLocalDateTime(campaign.startsAt),
    endsAt: toLocalDateTime(campaign.endsAt),
    status: campaign.status,
  }
}

export function CampaignEditorDialog({
  open,
  onOpenChange,
  siteId,
  campaign,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  campaign: CampaignRecord | null
  onSaved: (campaign: CampaignRecord) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)

  useEffect(() => {
    if (open) setForm(formFromCampaign(campaign))
  }, [campaign, open])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const save = async () => {
    const popupContent: PopupCampaignContent = {
      heading: form.heading,
      text: form.bodyText,
      imageUrl: form.imageUrl || null,
      goal: form.goal,
      ctaLabel: form.goal === "link" ? form.ctaLabel : "",
      ctaUrl: form.goal === "link" ? form.ctaUrl || null : null,
      submitLabel: form.submitLabel,
      successMessage: form.successMessage,
    }
    const input: CampaignInput = {
      siteId,
      name: form.name,
      type: form.type,
      content: form.type === "bar"
        ? { text: form.barText, ctaLabel: form.ctaLabel || null, ctaUrl: form.ctaUrl || null }
        : popupContent,
      targeting: {
        mode: form.targetingMode,
        paths: form.targetingMode === "all"
          ? []
          : form.targetPaths.split(/[\n,]/).map((path) => path.trim()).filter(Boolean),
      },
      trigger: form.type === "bar"
        ? { type: "immediate", value: null }
        : form.triggerType === "exit_intent"
          ? { type: "exit_intent", value: null }
          : { type: form.triggerType, value: Number(form.triggerValue) },
      frequency: form.frequency,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      status: form.status,
    }

    setSaving(true)
    const result = await saveCampaignAction(input, campaign?.id)
    setSaving(false)
    if (!result.ok) {
      showActionError(result.message)
      return
    }
    onSaved(result.data)
    showActionSuccess(campaign ? "Campaign updated" : "Campaign created")
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="admin" className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{campaign ? "Edit campaign" : "New campaign"}</DialogTitle>
            <DialogDescription>Configure content, targeting, timing, and visitor frequency.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="campaign-name">Name</Label>
              <Input id="campaign-name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Summer sale" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(value) => update("type", value as FormState["type"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="bar">Announcement bar</SelectItem><SelectItem value="popup">Popup</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => update("status", value as FormState["status"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="active">Active</SelectItem></SelectContent>
              </Select>
            </div>

            {form.type === "bar" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="campaign-text">Announcement text</Label>
                <Textarea id="campaign-text" value={form.barText} onChange={(event) => update("barText", event.target.value)} />
              </div>
            ) : (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="campaign-heading">Heading</Label>
                  <Input id="campaign-heading" value={form.heading} onChange={(event) => update("heading", event.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="campaign-body">Text</Label>
                  <Textarea id="campaign-body" value={form.bodyText} onChange={(event) => update("bodyText", event.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Image</Label>
                  <div className="flex gap-2">
                    <Input value={form.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} placeholder="Optional image URL" />
                    <Button type="button" variant="outline" onClick={() => setMediaOpen(true)}><ImageIcon className="size-4" /> Choose</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Popup goal</Label>
                  <Select value={form.goal} onValueChange={(value) => update("goal", value as FormState["goal"])}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="link">CTA link</SelectItem><SelectItem value="email">Email capture</SelectItem></SelectContent>
                  </Select>
                </div>
              </>
            )}

            {(form.type === "bar" || form.goal === "link") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="campaign-cta-label">CTA label</Label>
                  <Input id="campaign-cta-label" value={form.ctaLabel} onChange={(event) => update("ctaLabel", event.target.value)} placeholder={form.type === "bar" ? "Optional" : "Learn more"} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="campaign-cta-url">CTA link</Label>
                  <Input id="campaign-cta-url" value={form.ctaUrl} onChange={(event) => update("ctaUrl", event.target.value)} placeholder="/products" />
                </div>
              </>
            )}

            {form.type === "popup" && form.goal === "email" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="campaign-submit-label">Submit label</Label>
                  <Input id="campaign-submit-label" value={form.submitLabel} onChange={(event) => update("submitLabel", event.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="campaign-success">Success message</Label>
                  <Input id="campaign-success" value={form.successMessage} onChange={(event) => update("successMessage", event.target.value)} />
                  <p className="text-xs text-muted-foreground">Subscribers are added to this site&apos;s newsletter audience.</p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Show on</Label>
              <Select value={form.targetingMode} onValueChange={(value) => update("targetingMode", value as FormState["targetingMode"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All pages</SelectItem><SelectItem value="include">Only selected paths</SelectItem><SelectItem value="exclude">All except selected paths</SelectItem></SelectContent>
              </Select>
            </div>
            {form.targetingMode !== "all" && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="campaign-paths">Page paths</Label>
                <Textarea id="campaign-paths" value={form.targetPaths} onChange={(event) => update("targetPaths", event.target.value)} placeholder={"/pricing\n/products"} />
                <p className="text-xs text-muted-foreground">One path per line. Query strings are ignored.</p>
              </div>
            )}

            {form.type === "popup" && (
              <>
                <div className="space-y-2">
                  <Label>Trigger</Label>
                  <Select value={form.triggerType} onValueChange={(value) => update("triggerType", value as FormState["triggerType"])}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="delay">After delay</SelectItem><SelectItem value="scroll">After scroll</SelectItem><SelectItem value="exit_intent">Exit intent (desktop)</SelectItem></SelectContent>
                  </Select>
                </div>
                {form.triggerType !== "exit_intent" && (
                  <div className="space-y-2">
                    <Label htmlFor="campaign-trigger-value">{form.triggerType === "delay" ? "Seconds" : "Scroll percent"}</Label>
                    <Input id="campaign-trigger-value" type="number" min={form.triggerType === "delay" ? 0 : 1} max={form.triggerType === "delay" ? 300 : 100} value={form.triggerValue} onChange={(event) => update("triggerValue", event.target.value)} />
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(value) => update("frequency", value as FormState["frequency"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="once_per_visitor">Once per visitor</SelectItem><SelectItem value="once_per_session">Once per session</SelectItem><SelectItem value="every_visit">Every visit</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-start">Start (optional)</Label>
              <Input id="campaign-start" type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-end">End (optional)</Label>
              <Input id="campaign-end" type="datetime-local" value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save campaign"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MediaPicker open={mediaOpen} onOpenChange={setMediaOpen} onSelectMedia={(url) => update("imageUrl", url)} currentMediaUrl={form.imageUrl} showVideos={false} siteId={siteId} />
    </>
  )
}
