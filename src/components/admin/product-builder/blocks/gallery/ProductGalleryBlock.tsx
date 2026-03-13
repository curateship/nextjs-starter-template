import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Plus, Trash2, Upload } from "lucide-react"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"

interface ProductImage {
  id: string
  url: string
  alt: string
}

interface ProductGalleryBlockProps {
  images: ProductImage[]
  showThumbnails: boolean
  onImagesChange: (images: ProductImage[]) => void
  onShowThumbnailsChange: (show: boolean) => void
  onBack?: () => void
  visibility?: Record<string, boolean>
  onVisibilityChange?: (v: Record<string, boolean>) => void
}

export function ProductGalleryBlock({
  images,
  showThumbnails,
  onImagesChange,
  onShowThumbnailsChange,
  onBack,
  visibility,
  onVisibilityChange
}: ProductGalleryBlockProps) {
  const [activeTab, setActiveTab] = useState('content')

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
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Product Images</CardTitle>
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
                      className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
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
                          className="w-full h-full object-cover"
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
              <div className="text-center py-6 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                No images added yet. Click &quot;Add Image&quot; to upload your first product image.
              </div>
            )}
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
        {onVisibilityChange && (
          <VisibilitySettings
            visibility={visibility}
            onChange={onVisibilityChange}
            fields={[
              { key: 'thumbnails', label: 'Thumbnails' },
            ]}
          />
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Gallery Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <input
                id="showThumbnails"
                type="checkbox"
                checked={showThumbnails}
                onChange={(e) => onShowThumbnailsChange(e.target.checked)}
                className="mr-2"
              />
              <Label htmlFor="showThumbnails" className="text-sm">Show thumbnails</Label>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
