import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RichTextEditor } from "@/components/admin/layout/page-builder/RichTextEditor"
import { ImagePicker } from "@/components/admin/layout/image-library/ImagePicker"
import { ImageIcon, X } from "lucide-react"
import { useState } from "react"

interface ProductDefaultBlockProps {
  title: string
  richText: string
  featuredImage: string
  onTitleChange: (value: string) => void
  onRichTextChange: (value: string) => void
  onFeaturedImageChange: (value: string) => void
}

export function ProductDefaultBlock({
  title,
  richText,
  featuredImage,
  onTitleChange,
  onRichTextChange,
  onFeaturedImageChange
}: ProductDefaultBlockProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)

  const handleRemoveImage = () => {
    onFeaturedImageChange('')
  }

  return (
    <div className="space-y-4">
      {/* Title Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Product Title</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Enter product title"
            className="w-full"
          />
        </CardContent>
      </Card>

      {/* Rich Text Content Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Product Description</CardTitle>
        </CardHeader>
        <CardContent>
          <RichTextEditor
            content={{
              content: richText || '',
              hideHeader: true,
              hideEditorHeader: true
            }}
            onContentChange={(content) => onRichTextChange(content.content)}
          />
        </CardContent>
      </Card>

      {/* Featured Image Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Featured Image</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {featuredImage ? (
              <div className="relative rounded-lg overflow-hidden bg-muted">
                <img 
                  src={featuredImage} 
                  alt="Featured image preview" 
                  className="w-full h-48 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
                <div 
                  className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50 cursor-pointer"
                  onClick={() => setShowImagePicker(true)}
                >
                  <div className="text-white text-center">
                    <ImageIcon className="mx-auto h-8 w-8 mb-2" />
                    <p className="text-sm font-medium">Click to change image</p>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                className="flex items-center justify-center h-48 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                onClick={() => setShowImagePicker(true)}
              >
                <div className="text-center">
                  <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              This image will be displayed as the main product image
            </p>
          </div>

          {/* Image Picker Modal */}
          <ImagePicker
            open={showImagePicker}
            onOpenChange={setShowImagePicker}
            onSelectImage={(imageUrl) => {
              onFeaturedImageChange(imageUrl)
              setShowImagePicker(false)
            }}
            currentImageUrl={featuredImage || ''}
          />
        </CardContent>
      </Card>

      {/* Info Note */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <p className="text-xs text-blue-600 dark:text-blue-400">
          <strong>Note:</strong> This block displays your product's core information. 
          Changes here will update the product data directly.
        </p>
      </div>
    </div>
  )
}