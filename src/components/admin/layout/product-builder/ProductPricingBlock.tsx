"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, GripVertical } from "lucide-react"
import { Reorder, useDragControls } from "motion/react"

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

// Individual pricing tier component to avoid hook violations
const PricingTierItem = ({ 
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
}) => {
  const dragControls = useDragControls()
  
  return (
    <Reorder.Item
      key={tier.id}
      value={tier}
      className="border rounded-lg p-4 bg-background"
      dragListener={false}
      dragControls={dragControls}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
            onPointerDown={(e) => dragControls.start(e)}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-medium">Pricing Tier {tierIndex + 1}</h4>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`tier-${tierIndex}-popular`}
              checked={tier.isPopular || false}
              onCheckedChange={(checked) => updateTier(tierIndex, 'isPopular', checked)}
            />
            <Label htmlFor={`tier-${tierIndex}-popular`} className="text-sm">Popular</Label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeTier(tierIndex)}
            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-4">
        <div>
          <Label htmlFor={`tier-${tierIndex}-name`}>Name</Label>
          <Input
            id={`tier-${tierIndex}-name`}
            value={tier.name}
            onChange={(e) => updateTier(tierIndex, 'name', sanitizeAdminInput(e.target.value))}
            placeholder="Plan name"
          />
        </div>
        <div>
          <Label htmlFor={`tier-${tierIndex}-price`}>Price</Label>
          <Input
            id={`tier-${tierIndex}-price`}
            value={tier.price}
            onChange={(e) => updateTier(tierIndex, 'price', sanitizeAdminInput(e.target.value))}
            placeholder="29"
          />
        </div>
        <div>
          <Label htmlFor={`tier-${tierIndex}-interval`}>Interval</Label>
          <Input
            id={`tier-${tierIndex}-interval`}
            value={tier.interval}
            onChange={(e) => updateTier(tierIndex, 'interval', sanitizeAdminInput(e.target.value))}
            placeholder="Per month"
          />
        </div>
        <div>
          <Label htmlFor={`tier-${tierIndex}-comparison`}>Comparison</Label>
          <Input
            id={`tier-${tierIndex}-comparison`}
            value={tier.comparison}
            onChange={(e) => updateTier(tierIndex, 'comparison', sanitizeAdminInput(e.target.value))}
            placeholder="Features"
          />
        </div>
        <div className="col-span-4">
          <Label htmlFor={`tier-${tierIndex}-description`}>Description</Label>
          <Input
            id={`tier-${tierIndex}-description`}
            value={tier.description}
            onChange={(e) => updateTier(tierIndex, 'description', sanitizeAdminInput(e.target.value))}
            placeholder="Description for this pricing tier"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4">
        <div>
          <Label htmlFor={`tier-${tierIndex}-button`}>Button Text</Label>
          <Input
            id={`tier-${tierIndex}-button`}
            value={tier.buttonText}
            onChange={(e) => updateTier(tierIndex, 'buttonText', sanitizeAdminInput(e.target.value))}
            placeholder="Get Started"
          />
        </div>
        <div>
          <Label htmlFor={`tier-${tierIndex}-url`}>Button URL</Label>
          <Input
            id={`tier-${tierIndex}-url`}
            value={tier.buttonUrl || ""}
            onChange={(e) => {
              const sanitizedUrl = sanitizeAdminInput(e.target.value)
              if (isValidAdminUrl(sanitizedUrl) || sanitizedUrl === '') {
                updateTier(tierIndex, 'buttonUrl', sanitizedUrl)
              }
            }}
            placeholder="https://example.com"
            className={!isValidAdminUrl(tier.buttonUrl || "") && tier.buttonUrl ? "border-red-500" : ""}
          />
        </div>
        <div>
          <Label htmlFor={`tier-${tierIndex}-variant`}>Button Variant</Label>
          <Select
            value={tier.buttonVariant}
            onValueChange={(value) => updateTier(tierIndex, 'buttonVariant', value)}
          >
            <SelectTrigger id={`tier-${tierIndex}-variant`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="outline">Outline</SelectItem>
              <SelectItem value="secondary">Secondary</SelectItem>
              <SelectItem value="ghost">Ghost</SelectItem>
              <SelectItem value="link">Link</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4">
        <Label htmlFor={`tier-${tierIndex}-features`}>Features (one per line)</Label>
        <Textarea
          id={`tier-${tierIndex}-features`}
          value={tier.features.join('\n')}
          onChange={(e) => updateFeatures(tierIndex, sanitizeAdminInput(e.target.value))}
          placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
          rows={4}
        />
      </div>


    </Reorder.Item>
  )
}

interface PricingTier {
  id: string
  name: string
  description: string
  price: string
  interval: string
  buttonText: string
  buttonUrl: string
  buttonVariant: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link"
  features: string[]
  comparison: string
  isPopular?: boolean
}

interface ProductPricingBlockProps {
  title: string
  subtitle: string
  pricingTiers: PricingTier[]
  onTitleChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onPricingTiersChange: (tiers: PricingTier[]) => void
}

export function ProductPricingBlock({
  title,
  subtitle,
  pricingTiers,
  onTitleChange,
  onSubtitleChange,
  onPricingTiersChange,
}: ProductPricingBlockProps) {

  const addTier = () => {
    const newTier: PricingTier = {
      id: `tier-${Date.now()}-${Math.random()}`,
      name: `Plan ${pricingTiers.length + 1}`,
      description: "Description for this pricing tier",
      price: "29",
      interval: "Per month",
      buttonText: "Get Started",
      buttonUrl: "",
      buttonVariant: "default",
      features: ["Feature 1", "Feature 2", "Feature 3"],
      comparison: "Features"
    }
    
    const updatedTiers = [...pricingTiers, newTier]
    onPricingTiersChange(updatedTiers)
  }

  const updateTier = (index: number, field: keyof PricingTier, value: any) => {
    const updatedTiers = [...pricingTiers]
    updatedTiers[index] = { ...updatedTiers[index], [field]: value }
    onPricingTiersChange(updatedTiers)
  }

  const removeTier = (index: number) => {
    const updatedTiers = pricingTiers.filter((_, i) => i !== index)
    onPricingTiersChange(updatedTiers)
  }

  const updateFeatures = (tierIndex: number, featuresText: string) => {
    const updatedTiers = [...pricingTiers]
    const features = featuresText.split('\n')
    updatedTiers[tierIndex] = { ...updatedTiers[tierIndex], features }
    onPricingTiersChange(updatedTiers)
  }

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="pricing-title">Title</Label>
            <Input
              id="pricing-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Pricing"
            />
          </div>
          <div>
            <Label htmlFor="pricing-subtitle">Subtitle</Label>
            <Textarea
              id="pricing-subtitle"
              value={subtitle}
              onChange={(e) => onSubtitleChange(e.target.value)}
              placeholder="Check out our affordable pricing plans..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pricing Tiers Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Pricing Tiers</CardTitle>
            <Button onClick={addTier} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Tier
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pricingTiers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No pricing tiers added yet</p>
              <Button onClick={addTier} variant="outline" className="mt-2">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Tier
              </Button>
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={pricingTiers}
              onReorder={onPricingTiersChange}
              className="space-y-4"
            >
              {pricingTiers.map((tier, tierIndex) => (
                <PricingTierItem
                  key={tier.id}
                  tier={tier}
                  tierIndex={tierIndex}
                  updateTier={updateTier}
                  removeTier={removeTier}
                  updateFeatures={updateFeatures}
                />
              ))}
            </Reorder.Group>
          )}
        </CardContent>
      </Card>
    </div>
  )
}