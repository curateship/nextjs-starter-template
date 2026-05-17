"use client"

import { useState } from "react"
import { ImageIcon, Play } from "lucide-react"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"

interface StepItem {
  id: string
  image: string
  title: string
  description: string
}

interface Product3StepsFeatureBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i.test(url)
}

function StepItemEditor({
  step,
  index,
  updateStep,
  onPickImage,
  siteId,
  blockId,
}: {
  step: StepItem
  index: number
  updateStep: (index: number, field: keyof StepItem, value: string) => void
  onPickImage: (index: number) => void
  siteId: string
  blockId: string
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="grid gap-4 md:grid-cols-[96px_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label>Image</Label>
          <button
            type="button"
            onClick={() => onPickImage(index)}
            className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30 transition-colors hover:border-muted-foreground/60"
          >
            {step.image ? (
              isVideoUrl(step.image) ? (
                <div className="relative h-full w-full bg-black">
                  <video
                    src={`/api/media/proxy?url=${encodeURIComponent(step.image)}`}
                    className="h-full w-full object-cover"
                    muted
                    preload="metadata"
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-black/60 p-2">
                      <Play className="h-3 w-3 fill-white text-white" />
                    </span>
                  </span>
                </div>
              ) : (
                <img src={step.image} alt={step.title} className="h-full w-full object-cover" />
              )
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
        </div>

        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor={`step-title-${step.id}`}>Step {index + 1} Title</Label>
            <Input
              id={`step-title-${step.id}`}
              value={step.title}
              onChange={(event) => updateStep(index, "title", event.target.value)}
              placeholder="Step title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`step-description-${step.id}`}>Step {index + 1} Description</Label>
            <div className="min-h-24 rounded-md border bg-background p-3 [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-6">
              <InlineRichTextEditor
                blockId={`${blockId}-${step.id}-description`}
                content={{ htmlContent: step.description }}
                onContentChange={(htmlContent) => updateStep(index, "description", htmlContent)}
                siteId={siteId}
                isActive
                variant="product"
                placeholder="Describe this step"
                hidePlaceholderOnFocus
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Product3StepsFeatureBlock({
  content,
  onContentChange,
  siteId,
  blockId,
  onBack,
}: Product3StepsFeatureBlockProps) {
  const [imagePickerIndex, setImagePickerIndex] = useState<number | null>(null)
  const steps = Array.isArray(content.steps) ? content.steps.slice(0, 3) as StepItem[] : []

  const updateSteps = (nextSteps: StepItem[]) => {
    onContentChange("steps", nextSteps.slice(0, 3))
  }

  const updateStep = (index: number, field: keyof StepItem, value: string) => {
    const nextSteps = [...steps]
    nextSteps[index] = { ...nextSteps[index], [field]: value }
    updateSteps(nextSteps)
  }

  const stepVisibilityFields = steps.flatMap((step, index) => [
    { key: `${step.id}Title`, label: `Step ${index + 1} Title` },
    { key: `${step.id}Description`, label: `Step ${index + 1} Description` },
    { key: `${step.id}Image`, label: `Step ${index + 1} Image` },
  ])

  return (
    <>
      <BlockTabs
        onBack={onBack}
        headerClassName="pt-0"
        tabs={[
          {
            value: "content",
            label: "Content",
            content: (
              <CardGroup className="grid">
                <Card>
                  <CardHeader>
                    <DashboardModalCardTitle>Header Settings</DashboardModalCardTitle>
                    <CardDescription>Set the section heading and alignment.</CardDescription>
                  </CardHeader>
                  <CardContent className="lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
                    <div className="space-y-2">
                      <Label htmlFor="three-steps-header">Header</Label>
                      <Input
                        id="three-steps-header"
                        value={content.header ?? ""}
                        onChange={(event) => onContentChange("header", event.target.value)}
                        placeholder="Launch with Assurance"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="three-steps-subheader">Sub Header</Label>
                      <Input
                        id="three-steps-subheader"
                        value={content.subheader ?? ""}
                        onChange={(event) => onContentChange("subheader", event.target.value)}
                        placeholder="Simplify your workflow with clear insights."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="three-steps-align">Header Alignment</Label>
                      <Select
                        value={content.headerAlign ?? "center"}
                        onValueChange={(value) => onContentChange("headerAlign", value)}
                      >
                        <SelectTrigger id="three-steps-align" size="button">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                          <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <BlockEditorSection heading="Steps" description="Edit the three fixed steps.">
                      <div className="space-y-3">
                        {steps.map((step, index) => (
                          <StepItemEditor
                            key={step.id}
                            step={step}
                            index={index}
                            updateStep={updateStep}
                            onPickImage={setImagePickerIndex}
                            siteId={siteId}
                            blockId={blockId}
                          />
                        ))}
                      </div>
                    </BlockEditorSection>
                  </CardContent>
                </Card>
              </CardGroup>
            ),
          },
          {
            value: "settings",
            label: "Settings",
            content: (
              <CardGroup className="grid">
                <VisibilitySettings
                  title="Header Visibility"
                  visibility={content.visibility}
                  onChange={(visibility) => onContentChange("visibility", visibility)}
                  includeHideBlock={false}
                  useCard
                  fields={[
                    { key: "header", label: "Header" },
                    { key: "subheader", label: "Sub Header" },
                  ]}
                />
                <VisibilitySettings
                  title="Step Visibility"
                  visibility={content.visibility}
                  onChange={(visibility) => onContentChange("visibility", visibility)}
                  includeHideBlock={false}
                  useCard
                  fields={stepVisibilityFields}
                />
                <VisibilitySettings
                  title="Block Visibility"
                  visibility={content.visibility}
                  onChange={(visibility) => onContentChange("visibility", visibility)}
                  useCard
                  fields={[]}
                />
              </CardGroup>
            ),
          },
        ]}
      />

      <MediaPicker
        open={imagePickerIndex !== null}
        onOpenChange={(open) => setImagePickerIndex(open ? imagePickerIndex : null)}
        onSelectMedia={(imageUrl) => {
          if (imagePickerIndex === null) return
          updateStep(imagePickerIndex, "image", imageUrl)
          setImagePickerIndex(null)
        }}
        currentMediaUrl={imagePickerIndex !== null ? steps[imagePickerIndex]?.image : undefined}
        showVideos={true}
        site_id={siteId}
      />
    </>
  )
}
