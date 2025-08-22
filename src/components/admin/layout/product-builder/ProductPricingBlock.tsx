"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, GripVertical } from "lucide-react"
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

const isValidAdminUrl = (url: string): boolean => {
  if (!url || url.trim() === '') return true // Empty URLs are allowed
  try {
    const parsedUrl = new URL(url)
    // Only allow HTTP(S) protocols for admin inputs
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
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
}

interface ProductPricingBlockProps {
  headerTitle?: string
  headerSubtitle?: string
  headerAlign?: 'left' | 'center'
  tiers: PricingTier[]
  onHeaderTitleChange: (value: string) => void
  onHeaderSubtitleChange: (value: string) => void
  onHeaderAlignChange?: (value: 'left' | 'center') => void
  onTiersChange: (tiers: PricingTier[]) => void
}

// Sortable pricing tier item component
function SortablePricingTierItem({
  tier,
  tierIndex,
  updateTier,
  removeTier,
  updateFeatures
}: {
  tier: PricingTier
  tierIndex: number
  updateTier: (index: number, field: keyof PricingTier, value: any) => void
  removeTier: (index: number) => void
  updateFeatures: (tierIndex: number, featuresText: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tier.id })

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

        <div>
          <Label htmlFor={`tier-features-${tierIndex}`}>Features (one per line)</Label>
          <Textarea
            id={`tier-features-${tierIndex}`}
            value={tier.features.join('\n')}
            onChange={(e) => updateFeatures(tierIndex, e.target.value)}
            placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
            rows={4}
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

export function ProductPricingBlock({
  headerTitle = '',
  headerSubtitle = '',
  headerAlign = 'left',
  tiers,
  onHeaderTitleChange,
  onHeaderSubtitleChange,
  onHeaderAlignChange,
  onTiersChange,
}: ProductPricingBlockProps) {
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

  const addTier = () => {
    const newTier: PricingTier = {
      id: `tier-${Date.now()}-${Math.random()}`,
      name: `Plan ${(tiers?.length || 0) + 1}`,
      price: "$0",
      period: "per month",
      description: "Perfect for getting started",
      features: ["Feature 1", "Feature 2", "Feature 3"],
      buttonText: "Get Started",
      buttonUrl: "",
      highlighted: false,
      ribbonText: "",
      ribbonColor: "blue"
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
    const features = featuresText.split('\n').filter(f => f.trim() !== '')
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

  return (
    <div className="space-y-6">
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
                value={headerTitle}
                onChange={(e) => onHeaderTitleChange(sanitizeAdminInput(e.target.value))}
                placeholder="Pricing Plans"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="pricing-subtitle">Subtitle</Label>
              <Input
                id="pricing-subtitle"
                value={headerSubtitle}
                onChange={(e) => onHeaderSubtitleChange(sanitizeAdminInput(e.target.value))}
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
    </div>
  )
}