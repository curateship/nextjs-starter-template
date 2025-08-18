"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, GripVertical } from "lucide-react"
import { useState, useRef } from "react"
import { Reorder } from "motion/react"

interface PricingTier {
  id: string
  name: string
  description: string
  price: string
  interval: string
  buttonText: string
  buttonVariant: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link"
  features: string[]
  comparison: string
  hasPurchaseOption: boolean
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
  const tiersTimeoutRef = useRef<NodeJS.Timeout>()

  const addTier = () => {
    const newTier: PricingTier = {
      id: `tier-${Date.now()}-${Math.random()}`,
      name: `Plan ${pricingTiers.length + 1}`,
      description: "Description for this pricing tier",
      price: "29",
      interval: "Per month",
      buttonText: "Get Started",
      buttonVariant: "default",
      features: ["Feature 1", "Feature 2", "Feature 3"],
      comparison: "Features",
      hasPurchaseOption: true
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
                <Reorder.Item
                  key={tier.id}
                  value={tier}
                  className="border rounded-lg p-4 bg-background"
                  whileDrag={{ scale: 1.02 }}
                >
                  <div className="space-y-4">
                    {/* Tier Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <GripVertical 
                          className="w-4 h-4 text-muted-foreground cursor-grab" 
                        />
                        <span className="font-medium">Tier {tierIndex + 1}</span>
                      </div>
                      <Button
                        onClick={() => removeTier(tierIndex)}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Tier Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Plan Name</Label>
                        <Input
                          value={tier.name}
                          onChange={(e) => updateTier(tierIndex, 'name', e.target.value)}
                          placeholder="Plan name"
                        />
                      </div>
                      <div>
                        <Label>Price</Label>
                        <Input
                          value={tier.price}
                          onChange={(e) => updateTier(tierIndex, 'price', e.target.value)}
                          placeholder="29"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Interval</Label>
                        <Input
                          value={tier.interval}
                          onChange={(e) => updateTier(tierIndex, 'interval', e.target.value)}
                          placeholder="Per month"
                        />
                      </div>
                      <div>
                        <Label>Button Variant</Label>
                        <Select
                          value={tier.buttonVariant}
                          onValueChange={(value) => updateTier(tierIndex, 'buttonVariant', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            <SelectItem value="outline">Outline</SelectItem>
                            <SelectItem value="secondary">Secondary</SelectItem>
                            <SelectItem value="ghost">Ghost</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`popular-${tierIndex}`}
                        checked={tier.isPopular || false}
                        onCheckedChange={(checked) => updateTier(tierIndex, 'isPopular', checked)}
                      />
                      <Label htmlFor={`popular-${tierIndex}`}>
                        Mark as Popular (adds highlighted border)
                      </Label>
                    </div>

                    <div>
                      <Label>Description</Label>
                      <Textarea
                        value={tier.description}
                        onChange={(e) => updateTier(tierIndex, 'description', e.target.value)}
                        placeholder="Description for this tier"
                        rows={2}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Button Text</Label>
                        <Input
                          value={tier.buttonText}
                          onChange={(e) => updateTier(tierIndex, 'buttonText', e.target.value)}
                          placeholder="Get Started"
                        />
                      </div>
                      <div>
                        <Label>Features Comparison</Label>
                        <Input
                          value={tier.comparison}
                          onChange={(e) => updateTier(tierIndex, 'comparison', e.target.value)}
                          placeholder="Features"
                        />
                      </div>
                    </div>

                    {/* Features */}
                    <div>
                      <Label>Features</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Enter each feature on a new line
                      </p>
                      <Textarea
                        value={tier.features.join('\n')}
                        onChange={(e) => updateFeatures(tierIndex, e.target.value)}
                        placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
                        rows={6}
                        className="resize-none"
                      />
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </CardContent>
      </Card>
    </div>
  )
}