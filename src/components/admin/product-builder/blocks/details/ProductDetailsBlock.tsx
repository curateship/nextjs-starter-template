import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"

interface Specification {
  label: string
  value: string
}

interface ProductDetailsBlockProps {
  description: string
  specifications: Specification[]
  onDescriptionChange: (value: string) => void
  onSpecificationsChange: (specs: Specification[]) => void
  onBack?: () => void
}

export function ProductDetailsBlock({
  description,
  specifications,
  onDescriptionChange,
  onSpecificationsChange,
  onBack
}: ProductDetailsBlockProps) {
  const [activeTab, setActiveTab] = useState('content')

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
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="px-6 pt-6 flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm h-10 bg-muted"
          >
            <ArrowLeft className="w-3.5 h-4 mr-1.5" />
            Back
          </button>
        )}
        <TabsList className="gap-1">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="style">Style</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="content" className="px-6 pb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Edit Product Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  No specifications added yet. Click &quot;Add&quot; to create your first specification.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="style" className="px-6 pb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Style options coming soon.</p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="settings" className="px-6 pb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No additional settings for this block.</p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
