import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"

interface Specification {
  label: string
  value: string
}

interface ProductDetailsBlockProps {
  description: string
  specifications: Specification[]
  onDescriptionChange: (value: string) => void
  onSpecificationsChange: (specs: Specification[]) => void
}

export function ProductDetailsBlock({
  description,
  specifications,
  onDescriptionChange,
  onSpecificationsChange
}: ProductDetailsBlockProps) {
  const addSpecification = () => {
    const newSpecs = [...specifications, { label: "New Feature", value: "Value" }]
    onSpecificationsChange(newSpecs)
  }

  const removeSpecification = (index: number) => {
    const newSpecs = specifications.filter((_, i) => i !== index)
    onSpecificationsChange(newSpecs)
  }

  const updateSpecification = (index: number, field: 'label' | 'value', value: string) => {
    const newSpecs = [...specifications]
    newSpecs[index] = { ...newSpecs[index], [field]: value }
    onSpecificationsChange(newSpecs)
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Edit Product Details</Label>
      </div>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="description" className="text-sm font-medium">Product Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Detailed product description..."
            className="mt-1"
            rows={4}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">Specifications</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={addSpecification}
              className="h-8"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
          
          <div className="space-y-2">
            {specifications.map((spec, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  value={spec.label}
                  onChange={(e) => updateSpecification(index, 'label', e.target.value)}
                  placeholder="Feature name"
                  className="flex-1"
                />
                <Input
                  value={spec.value}
                  onChange={(e) => updateSpecification(index, 'value', e.target.value)}
                  placeholder="Feature value"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSpecification(index)}
                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          {specifications.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No specifications added yet. Click "Add" to create your first specification.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}