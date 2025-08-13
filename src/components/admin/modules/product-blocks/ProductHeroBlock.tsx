import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

interface ProductHeroBlockProps {
  title: string
  subtitle: string
  price: string
  ctaText: string
  onTitleChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onPriceChange: (value: string) => void
  onCtaTextChange: (value: string) => void
}

export function ProductHeroBlock({
  title,
  subtitle,
  price,
  ctaText,
  onTitleChange,
  onSubtitleChange,
  onPriceChange,
  onCtaTextChange
}: ProductHeroBlockProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Edit Product Hero</Label>
      </div>
      
      <div className="space-y-3">
        <div>
          <Label htmlFor="title" className="text-sm font-medium">Product Title</Label>
          <Input
            id="title"
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Enter product title"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="subtitle" className="text-sm font-medium">Subtitle</Label>
          <Textarea
            id="subtitle"
            value={subtitle}
            onChange={(e) => onSubtitleChange(e.target.value)}
            placeholder="Enter product subtitle or description"
            className="mt-1"
            rows={2}
          />
        </div>

        <div>
          <Label htmlFor="price" className="text-sm font-medium">Price</Label>
          <Input
            id="price"
            type="text"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            placeholder="$99.99"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="ctaText" className="text-sm font-medium">Call-to-Action Button Text</Label>
          <Input
            id="ctaText"
            type="text"
            value={ctaText}
            onChange={(e) => onCtaTextChange(e.target.value)}
            placeholder="Add to Cart"
            className="mt-1"
          />
        </div>
      </div>
    </div>
  )
}