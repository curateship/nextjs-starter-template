"use client"

import { useState } from "react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, ImageIcon } from "lucide-react"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
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

const DEFAULT_STEPS: StepItem[] = [
  {
    id: "step-monitor-deployments",
    image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-1.svg",
    title: "Monitor Deployments Live",
    description: "Track your deployments with clarity, seeing updates take place as they happen.",
  },
  {
    id: "step-detect-issues",
    image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-2.svg",
    title: "Immediate Issue Detection",
    description: "Spot issues instantly and address them with precise metrics for optimized performance.",
  },
  {
    id: "step-stable-version",
    image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-3.svg",
    title: "Revert to a Stable Version",
    description: "Restore system health swiftly by returning to a previous stable version.",
  },
]

function normalizeSteps(steps: unknown): StepItem[] {
  const source = Array.isArray(steps) ? steps : []

  return DEFAULT_STEPS.map((defaultStep, index) => {
    const step = source[index] && typeof source[index] === "object"
      ? source[index] as Partial<StepItem>
      : {}

    return {
      id: typeof step.id === "string" && step.id ? step.id : defaultStep.id,
      image: typeof step.image === "string" ? step.image : defaultStep.image,
      title: typeof step.title === "string" ? step.title : defaultStep.title,
      description: typeof step.description === "string" ? step.description : defaultStep.description,
    }
  })
}

function SortableStepItem({
  step,
  index,
  updateStep,
  onPickImage,
}: {
  step: StepItem
  index: number
  updateStep: (index: number, field: keyof StepItem, value: string) => void
  onPickImage: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-background p-4 transition-colors hover:border-muted-foreground/50">
      <div className="flex gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-9 shrink-0 cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder step ${index + 1}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="grid flex-1 gap-4 md:grid-cols-[96px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label>Image</Label>
            <button
              type="button"
              onClick={() => onPickImage(index)}
              className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30 transition-colors hover:border-muted-foreground/60"
            >
              {step.image ? (
                <img src={step.image} alt={step.title} className="h-full w-full object-cover" />
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
              <Textarea
                id={`step-description-${step.id}`}
                value={step.description}
                onChange={(event) => updateStep(index, "description", event.target.value)}
                placeholder="Describe this step"
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
  onBack,
}: Product3StepsFeatureBlockProps) {
  const [imagePickerIndex, setImagePickerIndex] = useState<number | null>(null)
  const steps = normalizeSteps(content.steps)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const updateSteps = (nextSteps: StepItem[]) => {
    onContentChange("steps", nextSteps.slice(0, 3))
  }

  const updateStep = (index: number, field: keyof StepItem, value: string) => {
    const nextSteps = [...steps]
    nextSteps[index] = { ...nextSteps[index], [field]: value }
    updateSteps(nextSteps)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = steps.findIndex((step) => step.id === active.id)
    const newIndex = steps.findIndex((step) => step.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    updateSteps(arrayMove(steps, oldIndex, newIndex))
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
                    <BlockEditorSection heading="Steps" description="Edit and reorder the three fixed steps.">
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={steps.map((step) => step.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-3">
                            {steps.map((step, index) => (
                              <SortableStepItem
                                key={step.id}
                                step={step}
                                index={index}
                                updateStep={updateStep}
                                onPickImage={setImagePickerIndex}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
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
        showVideos={false}
        site_id={siteId}
      />
    </>
  )
}
