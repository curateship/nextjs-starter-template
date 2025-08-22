import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Eye, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ProductDefaultBlockProps {
  title: string
  richText: string
  featuredImage: string
  onOpenSettings?: () => void
}

export function ProductDefaultBlock({
  title,
  richText,
  featuredImage,
  onOpenSettings
}: ProductDefaultBlockProps) {
  
  return (
    <div className="space-y-4">
      {/* Header with View-Only Info */}
      <Card className="shadow-sm border-blue-200 bg-blue-50/30 dark:bg-blue-900/10 dark:border-blue-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Eye className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-base text-blue-700 dark:text-blue-300">Product Information (View Only)</CardTitle>
            </div>
            {onOpenSettings && (
              <Button 
                onClick={onOpenSettings}
                variant="outline" 
                size="sm"
                className="text-xs"
              >
                <Settings className="h-3 w-3 mr-1" />
                Edit in Settings
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-blue-600 dark:text-blue-400">
            This block displays your product's information from the product settings. 
            To edit the title, description, or featured image, use the Product Settings modal.
          </p>
        </CardContent>
      </Card>

      {/* Product Title Display */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Product Title</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium">{title || 'No title set'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Product Description Display */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Product Description</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-3 bg-muted/50 rounded-lg min-h-[120px]">
            {richText && richText.trim() !== '' ? (
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: richText }}
              />
            ) : (
              <p className="text-sm text-muted-foreground italic">No description set</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Featured Image Display */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Featured Image</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {featuredImage ? (
              <div className="rounded-lg overflow-hidden bg-muted">
                <img 
                  src={featuredImage} 
                  alt="Featured image preview" 
                  className="w-full h-48 object-cover"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50">
                <div className="text-center">
                  <Eye className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No featured image set</p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Featured image for this product
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}