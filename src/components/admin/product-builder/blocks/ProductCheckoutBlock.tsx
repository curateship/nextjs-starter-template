"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Plus, Trash2, GripVertical, Bold, Italic, List, ListOrdered, Heading2, Heading3 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { MediaInput } from "@/components/admin/media-library/MediaInput"
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

const isValidPartialUrl = (url: string): boolean => {
  if (!url || url.trim() === '') return true // Empty URLs are allowed

  // Allow partial URLs while typing (like "http", "https:", "https://ex")
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return true
  }

  // Block dangerous protocols immediately
  if (url.toLowerCase().includes('javascript:') ||
      url.toLowerCase().includes('data:') ||
      url.toLowerCase().includes('vbscript:')) {
    return false
  }

  return true // Allow other partial input
}

interface PricingTier {
  id: string
  name: string
  price: string
  period: string
  description: string
  features: string[]
  buttonText: string
  buttonUrl: string
  highlighted: boolean
  ribbonText: string
  ribbonColor: 'blue' | 'green' | 'purple' | 'red' | 'yellow'
  stripePriceId?: string
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
  mode: 'payment' | 'subscription'
  successUrl: string
  cancelUrl: string
  orderBumps: OrderBump[]
}

interface DownloadSettings {
  enabled: boolean
  thankYouMessage: string
  content: string
}

interface ProductCheckoutBlockProps {
  header?: string
  subheader?: string
  headerAlign?: 'left' | 'center'
  tiers: PricingTier[]
  checkoutSettings?: CheckoutSettings
  downloadSettings?: DownloadSettings
  onHeaderChange: (value: string) => void
  onSubheaderChange: (value: string) => void
  onHeaderAlignChange?: (value: 'left' | 'center') => void
  onTiersChange: (tiers: PricingTier[]) => void
  onCheckoutSettingsChange?: (settings: CheckoutSettings) => void
  onDownloadSettingsChange?: (settings: DownloadSettings) => void
}

// Sortable pricing tier item component
function SortablePricingTierItem({
  tier,
  tierIndex,
  updateTier,
  removeTier,
  updateFeatures,
  showStripeFields
}: {
  tier: PricingTier
  tierIndex: number
  updateTier: (index: number, field: keyof PricingTier, value: any) => void
  removeTier: (index: number) => void
  updateFeatures: (tierIndex: number, featuresText: string) => void
  showStripeFields: boolean
}) {
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
      className="border rounded-lg p-4 bg-background hover:border-muted-foreground/50 transition-colors"
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
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 0.3fr 1.7fr 1fr 1fr' }}>
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
            <Label htmlFor={`tier-description-${tierIndex}`}>Description</Label>
            <Input
              id={`tier-description-${tierIndex}`}
              value={tier.description}
              onChange={(e) => updateTier(tierIndex, 'description', sanitizeAdminInput(e.target.value))}
              placeholder="Perfect for individuals getting started"
            />
          </div>
          <div>
            <Label htmlFor={`tier-period-${tierIndex}`}>Billing Period</Label>
            <Input
              id={`tier-period-${tierIndex}`}
              value={tier.period}
              onChange={(e) => updateTier(tierIndex, 'period', sanitizeAdminInput(e.target.value))}
              placeholder="per month"
            />
          </div>
          <div className="flex items-center space-x-2 pt-6">
            <Checkbox
              id={`tier-highlighted-${tierIndex}`}
              checked={tier.highlighted}
              onCheckedChange={(checked) => updateTier(tierIndex, 'highlighted', checked)}
            />
            <Label htmlFor={`tier-highlighted-${tierIndex}`}>Most Popular</Label>
          </div>
        </div>

        {showStripeFields && (
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
        )}

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
            className="min-h-[2.5rem] py-2 resize-none overflow-hidden"
            style={{ height: 'auto' }}
          />
        </div>

        <div className="grid grid-cols-4 gap-4">
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
            <Label htmlFor={`tier-button-url-${tierIndex}`}>Button URL</Label>
            <Input
              id={`tier-button-url-${tierIndex}`}
              value={tier.buttonUrl}
              onChange={(e) => {
                const url = e.target.value
                if (isValidPartialUrl(url)) {
                  updateTier(tierIndex, 'buttonUrl', url)
                }
              }}
              placeholder="https://example.com/signup"
              className={!isValidPartialUrl(tier.buttonUrl) ? 'border-red-300' : ''}
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
              <SelectTrigger>
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
      </div>
    </div>
  )
}

// Order Bump Item Component
function SortableOrderBumpItem({
  bump,
  bumpIndex,
  updateBump,
  removeBump,
}: {
  bump: OrderBump
  bumpIndex: number
  updateBump: (index: number, field: keyof OrderBump, value: any) => void
  removeBump: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bump.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-4 bg-background hover:border-muted-foreground/50 transition-colors"
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
          <h4 className="text-sm font-medium">Order Bump {bumpIndex + 1}</h4>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeBump(bumpIndex)}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor={`bump-title-${bumpIndex}`}>Title</Label>
            <Input
              id={`bump-title-${bumpIndex}`}
              value={bump.title}
              onChange={(e) => updateBump(bumpIndex, 'title', sanitizeAdminInput(e.target.value))}
              placeholder="Priority Support"
            />
          </div>
          <div>
            <Label htmlFor={`bump-price-${bumpIndex}`}>Price</Label>
            <Input
              id={`bump-price-${bumpIndex}`}
              type="number"
              value={bump.price}
              onChange={(e) => updateBump(bumpIndex, 'price', parseFloat(e.target.value) || 0)}
              placeholder="29.99"
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`bump-description-${bumpIndex}`}>Description</Label>
          <Textarea
            id={`bump-description-${bumpIndex}`}
            value={bump.description}
            onChange={(e) => updateBump(bumpIndex, 'description', sanitizeAdminInput(e.target.value))}
            placeholder="Get 24/7 live chat support"
            rows={2}
          />
        </div>

        <div>
          <Label htmlFor={`bump-stripe-price-${bumpIndex}`}>Stripe Price ID</Label>
          <Input
            id={`bump-stripe-price-${bumpIndex}`}
            value={bump.stripePriceId}
            onChange={(e) => updateBump(bumpIndex, 'stripePriceId', sanitizeAdminInput(e.target.value))}
            placeholder="price_xxxxxxxxxxxxx"
          />
        </div>

        <div>
          <MediaInput
            label="Order Bump Image"
            value={bump.imageUrl || ''}
            onChange={(value) => updateBump(bumpIndex, 'imageUrl', value)}
            placeholder="Select an image from media library"
            description="Optional image to display with the order bump"
            acceptVideo={false}
            hideUrlInput={true}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id={`bump-preselected-${bumpIndex}`}
            checked={bump.isPreSelected}
            onCheckedChange={(checked) => updateBump(bumpIndex, 'isPreSelected', checked)}
          />
          <Label htmlFor={`bump-preselected-${bumpIndex}`}>Pre-select by default</Label>
        </div>
      </div>
    </div>
  )
}

export function ProductCheckoutBlock({
  header = '',
  subheader = '',
  headerAlign = 'left',
  tiers,
  checkoutSettings,
  downloadSettings,
  onHeaderChange,
  onSubheaderChange,
  onHeaderAlignChange,
  onTiersChange,
  onCheckoutSettingsChange,
  onDownloadSettingsChange,
}: ProductCheckoutBlockProps) {
  const [activeTab, setActiveTab] = useState('pricing')

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

  // Initialize settings with defaults if not provided
  const currentCheckoutSettings: CheckoutSettings = checkoutSettings || {
    enabled: false,
    mode: 'payment',
    successUrl: '/products/[slug]/success',
    cancelUrl: '/products/[slug]/cancelled',
    orderBumps: [],
  }

  const currentDownloadSettings: DownloadSettings = downloadSettings || {
    enabled: false,
    thankYouMessage: 'Thank you for your purchase!',
    content: '',
  }

  // Pricing tier functions
  const addTier = () => {
    const newTier: PricingTier = {
      id: `tier-${Date.now()}-${Math.random()}`,
      name: `Plan ${(tiers?.length || 0) + 1}`,
      price: "$0",
      period: "per month",
      description: "Perfect for getting started",
      features: [],
      buttonText: "Get Started",
      buttonUrl: "",
      highlighted: false,
      ribbonText: "",
      ribbonColor: "blue",
      stripePriceId: "",
    }
    onTiersChange([...(tiers || []), newTier])
  }

  const removeTier = (index: number) => {
    const newTiers = (tiers || []).filter((_, i) => i !== index)
    onTiersChange(newTiers)
  }

  const updateTier = (index: number, field: keyof PricingTier, value: any) => {
    const newTiers = [...(tiers || [])]
    newTiers[index] = { ...newTiers[index], [field]: value }
    onTiersChange(newTiers)
  }

  const updateFeatures = (tierIndex: number, featuresText: string) => {
    const features = featuresText.split('\n')
    updateTier(tierIndex, 'features', features)
  }

  const handleTierDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id && tiers) {
      const oldIndex = tiers.findIndex((tier) => tier.id === active.id)
      const newIndex = tiers.findIndex((tier) => tier.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        onTiersChange(arrayMove(tiers, oldIndex, newIndex))
      }
    }
  }

  // Order bump functions
  const addOrderBump = () => {
    const newBump: OrderBump = {
      id: `bump-${Date.now()}-${Math.random()}`,
      title: "Order Bump",
      description: "Add this to your order",
      price: 0,
      stripePriceId: "",
      isPreSelected: false,
    }
    onCheckoutSettingsChange?.({
      ...currentCheckoutSettings,
      orderBumps: [...currentCheckoutSettings.orderBumps, newBump],
    })
  }

  const removeBump = (index: number) => {
    const newBumps = currentCheckoutSettings.orderBumps.filter((_, i) => i !== index)
    onCheckoutSettingsChange?.({
      ...currentCheckoutSettings,
      orderBumps: newBumps,
    })
  }

  const updateBump = (index: number, field: keyof OrderBump, value: any) => {
    const newBumps = [...currentCheckoutSettings.orderBumps]
    newBumps[index] = { ...newBumps[index], [field]: value }
    onCheckoutSettingsChange?.({
      ...currentCheckoutSettings,
      orderBumps: newBumps,
    })
  }

  const handleBumpDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const bumps = currentCheckoutSettings.orderBumps

    if (over && active.id !== over.id) {
      const oldIndex = bumps.findIndex((bump) => bump.id === active.id)
      const newIndex = bumps.findIndex((bump) => bump.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        onCheckoutSettingsChange?.({
          ...currentCheckoutSettings,
          orderBumps: arrayMove(bumps, oldIndex, newIndex),
        })
      }
    }
  }

  // Rich text editor for download content
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Enter your download page content here...',
      }),
    ],
    content: currentDownloadSettings.content || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-3 py-2',
      },
    },
    onUpdate: ({ editor }) => {
      onDownloadSettingsChange?.({
        ...currentDownloadSettings,
        content: editor.getHTML(),
      })
    },
  })

  // Update editor content when download settings change externally
  useEffect(() => {
    if (editor && currentDownloadSettings.content !== editor.getHTML()) {
      editor.commands.setContent(currentDownloadSettings.content || '')
    }
  }, [currentDownloadSettings.content, editor])

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="pricing">Pricing</TabsTrigger>
        <TabsTrigger value="checkout">Checkout</TabsTrigger>
        <TabsTrigger value="download">Download</TabsTrigger>
      </TabsList>

      {/* Tab 1: Pricing */}
      <TabsContent value="pricing" className="space-y-6 mt-6">
        {/* Header Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Header Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pricing-title">Title</Label>
                <Input
                  id="pricing-title"
                  value={header}
                  onChange={(e) => onHeaderChange(sanitizeAdminInput(e.target.value))}
                  placeholder="Pricing Plans"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pricing-subtitle">Subtitle</Label>
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
                  <SelectTrigger id="pricing-align">
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

        {/* Pricing Tiers Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Pricing Tiers</CardTitle>
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
          </CardHeader>
          <CardContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleTierDragEnd}
            >
              <SortableContext
                items={tiers?.map(t => t.id) || []}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {tiers?.map((tier, index) => (
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

            {(tiers?.length === 0 || !tiers) && (
              <div className="text-center py-8 text-muted-foreground">
                No pricing tiers yet. Click "Add Tier" to create one.
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab 2: Checkout */}
      <TabsContent value="checkout" className="space-y-6 mt-6">
        {/* Stripe Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stripe Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="checkout-enabled"
                checked={currentCheckoutSettings.enabled}
                onCheckedChange={(checked) =>
                  onCheckoutSettingsChange?.({
                    ...currentCheckoutSettings,
                    enabled: !!checked,
                  })
                }
              />
              <Label htmlFor="checkout-enabled" className="font-semibold">
                Enable Stripe Checkout
              </Label>
            </div>

            {currentCheckoutSettings.enabled && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="checkout-mode">Payment Mode</Label>
                    <Select
                      value={currentCheckoutSettings.mode}
                      onValueChange={(value: 'payment' | 'subscription') =>
                        onCheckoutSettingsChange?.({
                          ...currentCheckoutSettings,
                          mode: value,
                        })
                      }
                    >
                      <SelectTrigger id="checkout-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="payment">One-time Payment</SelectItem>
                        <SelectItem value="subscription">Subscription</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="success-url">Success URL</Label>
                    <Input
                      id="success-url"
                      value={currentCheckoutSettings.successUrl}
                      onChange={(e) =>
                        onCheckoutSettingsChange?.({
                          ...currentCheckoutSettings,
                          successUrl: e.target.value,
                        })
                      }
                      placeholder="/products/[slug]/success"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use [slug] as placeholder for product slug
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="cancel-url">Cancel URL</Label>
                    <Input
                      id="cancel-url"
                      value={currentCheckoutSettings.cancelUrl}
                      onChange={(e) =>
                        onCheckoutSettingsChange?.({
                          ...currentCheckoutSettings,
                          cancelUrl: e.target.value,
                        })
                      }
                      placeholder="/products/[slug]/cancelled"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use [slug] as placeholder for product slug
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Order Bumps */}
        {currentCheckoutSettings.enabled && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Order Bumps</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add complementary products that customers can add before checkout
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOrderBump}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Order Bump
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleBumpDragEnd}
              >
                <SortableContext
                  items={currentCheckoutSettings.orderBumps.map(b => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {currentCheckoutSettings.orderBumps.map((bump, index) => (
                      <SortableOrderBumpItem
                        key={bump.id}
                        bump={bump}
                        bumpIndex={index}
                        updateBump={updateBump}
                        removeBump={removeBump}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {currentCheckoutSettings.orderBumps.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No order bumps yet. Click "Add Order Bump" to create one.
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      {/* Tab 3: Download */}
      <TabsContent value="download" className="space-y-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Download Page Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="download-enabled"
                checked={currentDownloadSettings.enabled}
                onCheckedChange={(checked) =>
                  onDownloadSettingsChange?.({
                    ...currentDownloadSettings,
                    enabled: !!checked,
                  })
                }
              />
              <Label htmlFor="download-enabled" className="font-semibold">
                Enable Download Page
              </Label>
            </div>

            {currentDownloadSettings.enabled && (
              <div>
                  <Label>Page Content</Label>
                  <div className="border rounded-lg overflow-hidden">
                    {/* Editor Toolbar */}
                    <div className="border-b bg-muted/50 p-2 flex gap-1 flex-wrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor?.chain().focus().toggleBold().run()}
                        className={editor?.isActive('bold') ? 'bg-muted' : ''}
                      >
                        <Bold className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor?.chain().focus().toggleItalic().run()}
                        className={editor?.isActive('italic') ? 'bg-muted' : ''}
                      >
                        <Italic className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={editor?.isActive('heading', { level: 2 }) ? 'bg-muted' : ''}
                      >
                        <Heading2 className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                        className={editor?.isActive('heading', { level: 3 }) ? 'bg-muted' : ''}
                      >
                        <Heading3 className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor?.chain().focus().toggleBulletList().run()}
                        className={editor?.isActive('bulletList') ? 'bg-muted' : ''}
                      >
                        <List className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                        className={editor?.isActive('orderedList') ? 'bg-muted' : ''}
                      >
                        <ListOrdered className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Editor Content */}
                    <EditorContent editor={editor} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    This content will be displayed on the success/download page after purchase
                  </p>
                </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
