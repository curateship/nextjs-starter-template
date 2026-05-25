"use client"

import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockTabs } from "@/components/ui/tabs"
import { Plus, Trash2, GripVertical, Bold, Italic, List, ListOrdered, Heading2, Heading3 } from "lucide-react"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { useEffect, useRef, useState } from "react"
import { OrderBumpsModal } from "@/components/admin/product-builder/layout/OrderBumpsModal"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BlockEditorEmptyState } from "@/components/ui/tabs"
import { Card, CardGroup, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"

// Security utility functions for admin component
const sanitizeAdminInput = (input: string): string => {
  // Remove potential XSS vectors and limit length for admin inputs
  return input
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .substring(0, 1000) // Higher limit for admin but still prevent DoS
}

interface PricingTier {
  id: string
  name: string
  price: string
  interval?: string
  description: string
  features: string[]
  buttonText: string
  highlighted: boolean
  ribbonText: string
  ribbonColor: 'blue' | 'green' | 'purple' | 'red' | 'yellow'
  stripePriceId?: string
  enableDownloadPage?: boolean
  downloadContent?: string
  enableOrderBumps?: boolean
  orderBumps?: OrderBump[]
}

interface OrderBump {
  id: string
  title: string
  description: string
  price: number
  stripePriceId: string
  isPreSelected: boolean
  imageUrl?: string
}

interface CheckoutSettings {
  enabled: boolean
  successUrl: string
}

interface ProductCheckoutBlockProps {
  header?: string
  subheader?: string
  headerAlign?: 'left' | 'center'
  productPricingTiers: PricingTier[]
  checkoutSettings?: CheckoutSettings
  onHeaderChange: (value: string) => void
  onSubheaderChange: (value: string) => void
  onHeaderAlignChange?: (value: 'left' | 'center') => void
  onProductPricingTiersChange: (productPricingTiers: PricingTier[]) => void
  onCheckoutSettingsChange?: (settings: CheckoutSettings) => void
  visibility?: Record<string, boolean>
  onVisibilityChange?: (v: Record<string, boolean>) => void
  onBack?: () => void
}

// Sortable pricing tier item component
// Tier Download Editor Component
function TierDownloadEditor({
  content,
  onContentChange,
}: {
  content: string
  onContentChange: (content: string) => void
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Enter download page content here...',
      }),
    ],
    content: content || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-3 py-2',
      },
    },
    onUpdate: ({ editor }) => {
      onContentChange(editor.getHTML())
    },
  })

  // Update editor content when prop changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '')
    }
  }, [content, editor])

  if (!editor) {
    return null
  }

  return (
    <div className="border rounded-lg overflow-hidden mt-2">
      {/* Editor Toolbar */}
      <div className="border-b bg-muted/50 p-2 flex gap-1 flex-wrap">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'bg-muted' : ''}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'bg-muted' : ''}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'bg-muted' : ''}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'bg-muted' : ''}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? 'bg-muted' : ''}
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={editor.isActive('heading', { level: 3 }) ? 'bg-muted' : ''}
        >
          <Heading3 className="h-4 w-4" />
        </Button>
      </div>
      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  )
}

function SortablePricingTierItem({
  tier,
  tierIndex,
  updateTier,
  removeTier,
  updateFeatures,
  showStripeFields,
}: {
  tier: PricingTier
  tierIndex: number
  updateTier: (index: number, field: keyof PricingTier, value: any) => void
  removeTier: (index: number) => void
  updateFeatures: (tierIndex: number, featuresText: string) => void
  showStripeFields: boolean
}) {
  const [orderBumpsModalOpen, setOrderBumpsModalOpen] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tier.id })

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Auto-resize textarea on initial load and when features change
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [tier.features])

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-6 bg-background hover:border-muted-foreground/50 transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-medium">Tier {tierIndex + 1}</h4>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeTier(tierIndex)}
          className="h-8 w-8 p-0 text-foreground hover:text-foreground hover:bg-accent"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4 items-end">
          <div>
            <Label htmlFor={`tier-name-${tierIndex}`}>Plan Name</Label>
            <Input
              id={`tier-name-${tierIndex}`}
              value={tier.name}
              onChange={(e) => updateTier(tierIndex, 'name', sanitizeAdminInput(e.target.value))}
              placeholder="Basic Plan"
            />
          </div>
          <div>
            <Label htmlFor={`tier-price-${tierIndex}`}>Price</Label>
            <Input
              id={`tier-price-${tierIndex}`}
              value={tier.price}
              onChange={(e) => updateTier(tierIndex, 'price', sanitizeAdminInput(e.target.value))}
              placeholder="$9.99"
            />
          </div>
          <div>
            <Label htmlFor={`tier-interval-${tierIndex}`}>Billing Period</Label>
            <Input
              id={`tier-interval-${tierIndex}`}
              value={tier.interval || ''}
              onChange={(e) => updateTier(tierIndex, 'interval', sanitizeAdminInput(e.target.value))}
              placeholder="per month"
            />
          </div>
          <div className="flex items-center space-x-2 h-10">
            <Checkbox
              id={`tier-highlighted-${tierIndex}`}
              checked={tier.highlighted}
              onCheckedChange={(checked) => updateTier(tierIndex, 'highlighted', checked)}
            />
            <Label htmlFor={`tier-highlighted-${tierIndex}`}>Most Popular</Label>
          </div>
        </div>
        <div>
          <Label htmlFor={`tier-description-${tierIndex}`}>Description</Label>
          <Input
            id={`tier-description-${tierIndex}`}
            value={tier.description}
            onChange={(e) => updateTier(tierIndex, 'description', sanitizeAdminInput(e.target.value))}
            placeholder="Perfect for individuals getting started"
          />
        </div>

        <div>
          <Label htmlFor={`tier-features-${tierIndex}`}>Features (one per line)</Label>
          <Textarea
            ref={textareaRef}
            id={`tier-features-${tierIndex}`}
            value={tier.features.join('\n')}
            onChange={(e) => {
              updateFeatures(tierIndex, e.target.value)
              // Auto-resize the textarea
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = `${target.scrollHeight}px`
            }}
            placeholder="Add features on every new line"
            className="min-h-10 py-2 resize-none overflow-hidden"
            style={{ height: 'auto' }}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor={`tier-button-text-${tierIndex}`}>Button Text</Label>
            <Input
              id={`tier-button-text-${tierIndex}`}
              value={tier.buttonText}
              onChange={(e) => updateTier(tierIndex, 'buttonText', sanitizeAdminInput(e.target.value))}
              placeholder="Get Started"
            />
          </div>
          <div>
            <Label htmlFor={`tier-ribbon-text-${tierIndex}`}>Ribbon Text (optional)</Label>
            <Input
              id={`tier-ribbon-text-${tierIndex}`}
              value={tier.ribbonText}
              onChange={(e) => updateTier(tierIndex, 'ribbonText', sanitizeAdminInput(e.target.value))}
              placeholder="Most Popular"
            />
          </div>
          <div>
            <Label htmlFor={`tier-ribbon-color-${tierIndex}`}>Ribbon Color</Label>
            <Select
              value={tier.ribbonColor}
              onValueChange={(value) => updateTier(tierIndex, 'ribbonColor', value)}
            >
              <SelectTrigger size="button">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blue">Blue</SelectItem>
                <SelectItem value="green">Green</SelectItem>
                <SelectItem value="purple">Purple</SelectItem>
                <SelectItem value="red">Red</SelectItem>
                <SelectItem value="yellow">Yellow</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stripe-specific settings - only show when Stripe is enabled */}
        {showStripeFields && (
          <div className="space-y-4 pt-4">
            {/* Stripe Price ID */}
            <div>
              <Label htmlFor={`tier-stripe-price-${tierIndex}`}>Stripe Price ID</Label>
              <Input
                id={`tier-stripe-price-${tierIndex}`}
                value={tier.stripePriceId || ''}
                onChange={(e) => updateTier(tierIndex, 'stripePriceId', sanitizeAdminInput(e.target.value))}
                placeholder="price_xxxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get this from your Stripe dashboard
              </p>
            </div>

            {/* Download Page Settings */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`tier-download-enabled-${tierIndex}`}
                  checked={tier.enableDownloadPage || false}
                  onCheckedChange={(checked) => updateTier(tierIndex, 'enableDownloadPage', checked)}
                />
                <Label htmlFor={`tier-download-enabled-${tierIndex}`} className="font-semibold">
                  Enable Download Page
                </Label>
              </div>

              {tier.enableDownloadPage && (
                <div>
                  <Label>Download Page Content</Label>
                  <TierDownloadEditor
                    content={tier.downloadContent || ''}
                    onContentChange={(content) => updateTier(tierIndex, 'downloadContent', content)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This content will be displayed on the success page after purchase
                  </p>
                </div>
              )}
            </div>

            {/* Order Bumps Settings */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`tier-order-bumps-enabled-${tierIndex}`}
                  checked={tier.enableOrderBumps || false}
                  onCheckedChange={(checked) => updateTier(tierIndex, 'enableOrderBumps', checked)}
                />
                <Label htmlFor={`tier-order-bumps-enabled-${tierIndex}`} className="font-semibold">
                  Enable Order Bumps
                </Label>
              </div>

              {tier.enableOrderBumps && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Add upsell products that customers can add to their order at checkout
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOrderBumpsModalOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Manage Order Bumps ({tier.orderBumps?.length || 0})
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Order Bumps Modal */}
      <OrderBumpsModal
        open={orderBumpsModalOpen}
        onOpenChange={setOrderBumpsModalOpen}
        orderBumps={tier.orderBumps || []}
        onOrderBumpsChange={(bumps: OrderBump[]) => {
          updateTier(tierIndex, 'orderBumps', bumps)
        }}
      />
    </div>
  )
}

export function ProductCheckoutBlock({
  header = '',
  subheader = '',
  headerAlign = 'left',
  productPricingTiers,
  checkoutSettings,
  onHeaderChange,
  onSubheaderChange,
  onHeaderAlignChange,
  onProductPricingTiersChange,
  onCheckoutSettingsChange,
  visibility,
  onVisibilityChange,
  onBack,
}: ProductCheckoutBlockProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const currentCheckoutSettings: CheckoutSettings = {
    enabled: checkoutSettings?.enabled || false,
    successUrl: checkoutSettings?.successUrl || '/products/[slug]/success',
  }

  // Pricing tier functions
  const addTier = () => {
    const newTier: PricingTier = {
      id: `tier-${Date.now()}-${Math.random()}`,
      name: `Plan ${(productPricingTiers?.length || 0) + 1}`,
      price: "$0",
      interval: "per month",
      description: "Perfect for getting started",
      features: [],
      buttonText: "Get Started",
      highlighted: false,
      ribbonText: "",
      ribbonColor: "blue",
      stripePriceId: "",
    }
    onProductPricingTiersChange([...(productPricingTiers || []), newTier])
  }

  const removeTier = (index: number) => {
    const newTiers = (productPricingTiers || []).filter((_, i) => i !== index)
    onProductPricingTiersChange(newTiers)
  }

  const updateTier = (index: number, field: keyof PricingTier, value: any) => {
    const newTiers = [...(productPricingTiers || [])]
    newTiers[index] = { ...newTiers[index], [field]: value }
    onProductPricingTiersChange(newTiers)
  }

  const updateFeatures = (tierIndex: number, featuresText: string) => {
    const features = featuresText.split('\n')
    updateTier(tierIndex, 'features', features)
  }

  const handleTierDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id && productPricingTiers) {
      const oldIndex = productPricingTiers.findIndex((tier) => tier.id === active.id)
      const newIndex = productPricingTiers.findIndex((tier) => tier.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        onProductPricingTiersChange(arrayMove(productPricingTiers, oldIndex, newIndex))
      }
    }
  }

  return (
    <BlockTabs
      onBack={onBack}
      defaultTab="checkout"
      headerClassName="pt-0"
      tabs={[
        {
          value: "checkout",
          label: "Checkout",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Header Settings</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px] gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pricing-title">Header</Label>
                      <Input
                        id="pricing-title"
                        value={header}
                        onChange={(e) => onHeaderChange(sanitizeAdminInput(e.target.value))}
                        placeholder="Pricing Plans"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pricing-subtitle">Sub Header</Label>
                      <Input
                        id="pricing-subtitle"
                        value={subheader}
                        onChange={(e) => onSubheaderChange(sanitizeAdminInput(e.target.value))}
                        placeholder="Choose the perfect plan for your needs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pricing-align">Header Alignment</Label>
                      <Select value={headerAlign} onValueChange={onHeaderAlignChange}>
                        <SelectTrigger id="pricing-align" size="button">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Payment Checkout</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="payment-stripe"
                        checked={currentCheckoutSettings.enabled}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            onCheckoutSettingsChange?.({
                              enabled: true,
                              successUrl: currentCheckoutSettings.successUrl,
                            })
                          } else {
                            onCheckoutSettingsChange?.({
                              enabled: false,
                              successUrl: currentCheckoutSettings.successUrl,
                            })
                          }
                        }}
                      />
                      <Label htmlFor="payment-stripe" className="font-medium cursor-pointer">
                        Stripe
                      </Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Pricing Tiers</DashboardModalCardTitle>
                  <CardDescription>Add, edit, and reorder pricing tiers.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleTierDragEnd}
                  >
                    <SortableContext
                      items={productPricingTiers?.map(t => t.id) || []}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4">
                        {productPricingTiers?.map((tier, index) => (
                          <SortablePricingTierItem
                            key={tier.id}
                            tier={tier}
                            tierIndex={index}
                            updateTier={updateTier}
                            removeTier={removeTier}
                            updateFeatures={updateFeatures}
                            showStripeFields={currentCheckoutSettings.enabled}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  {(productPricingTiers?.length === 0 || !productPricingTiers) && (
                    <BlockEditorEmptyState>
                      No pricing tiers yet. Click Add Tier to create one.
                    </BlockEditorEmptyState>
                  )}

                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addTier}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Tier
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
              {onVisibilityChange && (
                <VisibilitySettings
                  title="Header Visibility"
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  includeHideBlock={false}
                  useCard
                  fields={[
                    { key: 'header', label: 'Header' },
                    { key: 'subheader', label: 'Sub Header' },
                  ]}
                />
              )}
              {onVisibilityChange && (
                <VisibilitySettings
                  title="Block Visibility"
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  useCard
                  fields={[]}
                />
              )}

              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Success Page Settings</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <Label htmlFor="success-url">Success URL</Label>
                    <Input
                      id="success-url"
                      value={currentCheckoutSettings.successUrl}
                      onChange={(e) =>
                        onCheckoutSettingsChange?.({
                          enabled: currentCheckoutSettings.enabled,
                          successUrl: e.target.value,
                        })
                      }
                      placeholder="/products/[slug]/success"
                      className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use [slug] as placeholder for product slug
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-2">About Success Pages</p>
                    <p>
                      The success page is where customers are redirected after a successful payment.
                      You can customize the download content for each pricing tier in the Checkout tab
                      by enabling Enable Download Page on individual tiers.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
