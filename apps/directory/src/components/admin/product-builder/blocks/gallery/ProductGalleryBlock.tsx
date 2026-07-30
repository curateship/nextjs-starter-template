import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardGroup, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { BlockTabs, BlockEditorEmptyState } from "@/components/admin/layout/builder/block-tabs"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Upload from "lucide-react/dist/esm/icons/upload.js"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"

interface ProductImage {
  id: string
  url: string
  alt: string
}

interface ProductGalleryBlockProps {
  images: ProductImage[]
  onImagesChange: (images: ProductImage[]) => void
  onBack?: () => void
  visibility?: Record<string, boolean>
  onVisibilityChange?: (v: Record<string, boolean>) => void
}

export function ProductGalleryBlock({
  images,
  onImagesChange,
  onBack,
  visibility,
  onVisibilityChange
}: ProductGalleryBlockProps) {
  const addImage = () => {
    const newImage: ProductImage = {
      id: `img-${Date.now()}`,
      url: "",
      alt: "Product image"
    }
    onImagesChange([...images, newImage])
  }

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index)
    onImagesChange(newImages)
  }

  const updateImage = (index: number, field: 'url' | 'alt', value: string) => {
    const newImages = [...images]
    newImages[index] = { ...newImages[index], [field]: value }
    onImagesChange(newImages)
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
                  <div className="flex items-center justify-between">
                    <DashboardModalCardTitle>Product Images</DashboardModalCardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addImage}
                      className="h-8"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Image
                    </Button>
                  </div>
                  <CardDescription>Upload and manage product gallery images.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {images.map((image, index) => (
                      <div key={image.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Image {index + 1}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeImage(index)}
                            className="h-6 w-6 p-0 text-foreground hover:text-foreground"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Image URL</Label>
                            <div className="flex space-x-2">
                              <Input
                                value={image.url}
                                onChange={(e) => updateImage(index, 'url', e.target.value)}
                                placeholder="https://example.com/image.jpg"
                                className="flex-1"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-10"
                                disabled
                              >
                                <Upload className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs text-muted-foreground">Alt Text</Label>
                            <Input
                              value={image.alt}
                              onChange={(e) => updateImage(index, 'alt', e.target.value)}
                              placeholder="Product image description"
                            />
                          </div>
                        </div>

                        {image.url && (
                          <div className="mt-2">
                            <div className="w-full h-24 bg-muted rounded border overflow-hidden">
                              <img
                                src={image.url}
                                alt={image.alt}
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.style.display = 'none'
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {images.length === 0 && (
                    <BlockEditorEmptyState className="py-6">
                      No images added yet. Click &quot;Add Image&quot; to upload your first product image.
                    </BlockEditorEmptyState>
                  )}
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
                    { key: 'thumbnails', label: 'Thumbnails' },
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
