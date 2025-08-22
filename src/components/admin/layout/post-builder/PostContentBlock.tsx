import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface PostContentBlockProps {
  content: string
  onContentChange: (content: string) => void
}

export function PostContentBlock({ content, onContentChange }: PostContentBlockProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Content</Label>
        <Textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="Write your post content here..."
          rows={10}
          className="resize-none"
        />
      </div>
    </div>
  )
}