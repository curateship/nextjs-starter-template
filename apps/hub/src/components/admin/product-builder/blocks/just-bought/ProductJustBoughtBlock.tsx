"use client"

import { useMemo, useState } from "react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, ImageIcon, Plus, Trash2 } from "lucide-react"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { BlockEditorEmptyState, BlockTabs } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  normalizeProductJustBoughtContent,
  type ProductJustBoughtMessage,
} from "@/lib/actions/products/just-bought"

interface ProductJustBoughtBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

function SortableMessageItem({
  item,
  index,
  blockId,
  updateItem,
  deleteItem,
  onPickAvatar,
}: {
  item: ProductJustBoughtMessage
  index: number
  blockId: string
  updateItem: (index: number, field: keyof ProductJustBoughtMessage, value: string) => void
  deleteItem: (index: number) => void
  onPickAvatar: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-background p-3 transition-colors hover:border-muted-foreground/50">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium">Message {index + 1}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => deleteItem(index)}
          className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-[auto_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,0.7fr)] items-start gap-3">
        <button
          type="button"
          onClick={() => onPickAvatar(index)}
          aria-label={item.avatar ? "Change buyer avatar" : "Select buyer avatar"}
          className="rounded-full transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar className="h-9 w-9 rounded-full border border-dotted border-input bg-muted">
            {item.avatar ? <AvatarImage src={item.avatar} alt={item.buyerName || `Buyer ${index + 1}`} /> : null}
            <AvatarFallback className="bg-muted text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        </button>

        <div className="space-y-1">
          <Label htmlFor={`${blockId}-buyer-${item.id}`} className="sr-only">Buyer name</Label>
          <Input
            id={`${blockId}-buyer-${item.id}`}
            value={item.buyerName}
            onChange={(event) => updateItem(index, "buyerName", event.target.value)}
            placeholder="Justin Lee"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${blockId}-action-${item.id}`} className="sr-only">Action</Label>
          <Input
            id={`${blockId}-action-${item.id}`}
            value={item.action}
            onChange={(event) => updateItem(index, "action", event.target.value)}
            placeholder="bought"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${blockId}-product-${item.id}`} className="sr-only">Product text</Label>
          <Input
            id={`${blockId}-product-${item.id}`}
            value={item.productText}
            onChange={(event) => updateItem(index, "productText", event.target.value)}
            placeholder="{{product_name}}"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${blockId}-time-${item.id}`} className="sr-only">Time text</Label>
          <Input
            id={`${blockId}-time-${item.id}`}
            value={item.timeText}
            onChange={(event) => updateItem(index, "timeText", event.target.value)}
            placeholder="1 hour ago"
          />
        </div>
      </div>
    </div>
  )
}

export function ProductJustBoughtBlock({
  content,
  onContentChange,
  siteId,
  blockId,
  onBack,
}: ProductJustBoughtBlockProps) {
  const normalizedContent = useMemo(() => normalizeProductJustBoughtContent(content), [content])
  const [avatarPickerIndex, setAvatarPickerIndex] = useState<number | null>(null)
  const messages = normalizedContent.messages
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const updateMessages = (nextMessages: ProductJustBoughtMessage[]) => {
    onContentChange("messages", nextMessages)
  }

  const addMessage = () => {
    updateMessages([
      ...messages,
      {
        id: `message-${Date.now()}`,
        avatar: "",
        buyerName: "",
        action: "bought",
        productText: "{{product_name}}",
        timeText: "just now",
      },
    ])
  }

  const updateMessage = (index: number, field: keyof ProductJustBoughtMessage, value: string) => {
    const nextMessages = [...messages]
    nextMessages[index] = { ...nextMessages[index], [field]: value }
    updateMessages(nextMessages)
  }

  const deleteMessage = (index: number) => {
    updateMessages(messages.filter((_, messageIndex) => messageIndex !== index))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = messages.findIndex((message) => message.id === active.id)
    const newIndex = messages.findIndex((message) => message.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      updateMessages(arrayMove(messages, oldIndex, newIndex))
    }
  }

  const handleSecondsChange = (field: "intervalSeconds" | "durationSeconds", value: string) => {
    const seconds = Math.max(1, Number.parseInt(value, 10) || 1)
    onContentChange(field, seconds)
  }

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
                    <DashboardModalCardTitle>Purchase Messages</DashboardModalCardTitle>
                    <CardDescription>Use {"{{product_name}}"} to insert the current product title.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={messages.map((message) => message.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                          {messages.map((message, index) => (
                            <SortableMessageItem
                              key={message.id}
                              item={message}
                              index={index}
                              blockId={blockId}
                              updateItem={updateMessage}
                              deleteItem={deleteMessage}
                              onPickAvatar={setAvatarPickerIndex}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {messages.length === 0 ? (
                      <BlockEditorEmptyState>
                        No messages yet. Click Add Message to create one.
                      </BlockEditorEmptyState>
                    ) : null}

                    <div className="pt-2">
                      <Button type="button" variant="outline" size="sm" onClick={addMessage}>
                        <Plus className="mr-1 h-4 w-4" />
                        Add Message
                      </Button>
                    </div>
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
                <Card>
                  <CardHeader>
                    <DashboardModalCardTitle>Timing</DashboardModalCardTitle>
                    <CardDescription>Show the first message on scroll, then rotate through the list.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`${blockId}-interval`}>Interval Seconds</Label>
                        <Input
                          id={`${blockId}-interval`}
                          type="number"
                          min={1}
                          value={normalizedContent.intervalSeconds}
                          onChange={(event) => handleSecondsChange("intervalSeconds", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${blockId}-duration`}>Toast Duration Seconds</Label>
                        <Input
                          id={`${blockId}-duration`}
                          type="number"
                          min={1}
                          value={normalizedContent.durationSeconds}
                          onChange={(event) => handleSecondsChange("durationSeconds", event.target.value)}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <Checkbox
                        id={`${blockId}-loop`}
                        checked={normalizedContent.loop}
                        onCheckedChange={(checked) => onContentChange("loop", checked === true)}
                      />
                      <Label htmlFor={`${blockId}-loop`} className="cursor-pointer">
                        Loop messages
                      </Label>
                    </div>
                  </CardContent>
                </Card>

                <VisibilitySettings
                  title="Elements Visibility"
                  visibility={normalizedContent.visibility}
                  onChange={(visibility) => onContentChange("visibility", visibility)}
                  includeHideBlock={false}
                  useCard
                  fields={[
                    { key: "avatar", label: "Avatar" },
                    { key: "buyerName", label: "Buyer Name" },
                    { key: "action", label: "Action" },
                    { key: "productText", label: "Product Text" },
                    { key: "timeText", label: "Time Text" },
                  ]}
                />

                <VisibilitySettings
                  title="Block Visibility"
                  visibility={normalizedContent.visibility}
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
        open={avatarPickerIndex !== null}
        onOpenChange={(open) => { if (!open) setAvatarPickerIndex(null) }}
        onSelectMedia={(imageUrl) => {
          if (avatarPickerIndex === null) return

          updateMessage(avatarPickerIndex, "avatar", imageUrl)
          setAvatarPickerIndex(null)
        }}
        currentMediaUrl={avatarPickerIndex !== null ? messages[avatarPickerIndex]?.avatar : undefined}
        site_id={siteId}
      />
    </>
  )
}
