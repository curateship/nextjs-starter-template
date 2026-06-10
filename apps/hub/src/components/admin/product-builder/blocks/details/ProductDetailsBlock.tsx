import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardGroup, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { BlockTabs, BlockEditorEmptyState } from "@/components/ui/tabs"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Plus, Trash2 } from "lucide-react"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"

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
  visibility?: Record<string, boolean>
  onVisibilityChange?: (v: Record<string, boolean>) => void
}

export function ProductDetailsBlock({
  description,
  specifications,
  onDescriptionChange,
  onSpecificationsChange,
  onBack,
  visibility,
  onVisibilityChange
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
                  <DashboardModalCardTitle>Product Details</DashboardModalCardTitle>
                  <CardDescription>Add a description and key specifications.</CardDescription>
                </CardHeader>
                <CardContent>
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
                            className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {specifications.length === 0 && (
                      <BlockEditorEmptyState className="py-4">
                        No specifications added yet. Click &quot;Add&quot; to create your first specification.
                      </BlockEditorEmptyState>
                    )}
                  </div>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "style",
          label: "Style",
          content: (
            <BlockEditorEmptyState>Style options coming soon.</BlockEditorEmptyState>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              {onVisibilityChange && (
                <VisibilitySettings
                  title="Elements Visibility"
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  includeHideBlock={false}
                  useCard
                  fields={[
                    { key: 'description', label: 'Description' },
                    { key: 'specifications', label: 'Specifications' },
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
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
