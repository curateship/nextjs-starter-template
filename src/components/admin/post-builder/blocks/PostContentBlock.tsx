'use client'

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import type { PostBlock } from "@/lib/actions/posts/post-actions"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Quote,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Code,
  ImageIcon
} from 'lucide-react'

interface PostContentBlockProps {
  block: PostBlock
  onContentChange: (content: Record<string, any>) => void
}

export function PostContentBlock({ block, onContentChange }: PostContentBlockProps) {
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false)
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Write your post content here...',
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full h-auto',
        },
      }),
    ],
    content: block.content?.body || block.content?.text || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-3 py-2',
      },
    },
    onUpdate: ({ editor }) => {
      onContentChange({
        ...block.content,
        body: editor.getHTML(),
        format: 'html'
      })
    },
  })

  // Update editor content when block changes
  useEffect(() => {
    if (editor) {
      const content = block.content?.body || block.content?.text || ''
      if (editor.getHTML() !== content) {
        editor.commands.setContent(content)
      }
    }
  }, [block.id, block.content, editor])

  const handleImageSelect = (imageUrl: string, altText?: string) => {
    if (editor) {
      editor.chain().focus().setImage({ src: imageUrl, alt: altText || '' }).run()
    }
  }

  if (!editor) {
    return <div>Loading editor...</div>
  }

  return (
    <div className="space-y-4">
      {/* TipTap Toolbar */}
        <div className="bg-muted/30 p-2 flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className="h-8 w-8 p-0"
            type="button"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className="h-8 w-8 p-0"
            type="button"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={editor.isActive('code') ? 'secondary' : 'ghost'}
            onClick={() => editor.chain().focus().toggleCode().run()}
            disabled={!editor.can().chain().focus().toggleCode().run()}
            className="h-8 w-8 p-0"
            type="button"
          >
            <Code className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-8 bg-border mx-1" />
          
          <Button
            size="sm"
            variant={editor.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className="h-8 w-8 p-0"
            type="button"
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={editor.isActive('heading', { level: 3 }) ? 'secondary' : 'ghost'}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className="h-8 w-8 p-0"
            type="button"
          >
            <Heading3 className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-8 bg-border mx-1" />
          
          <Button
            size="sm"
            variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className="h-8 w-8 p-0"
            type="button"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className="h-8 w-8 p-0"
            type="button"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={editor.isActive('blockquote') ? 'secondary' : 'ghost'}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className="h-8 w-8 p-0"
            type="button"
          >
            <Quote className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-8 bg-border mx-1" />
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsImagePickerOpen(true)}
            className="h-8 w-8 p-0"
            type="button"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-8 bg-border mx-1" />
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().chain().focus().undo().run()}
            className="h-8 w-8 p-0"
            type="button"
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().chain().focus().redo().run()}
            className="h-8 w-8 p-0"
            type="button"
          >
            <Redo className="h-4 w-4" />
          </Button>
        </div>

      {/* TipTap Editor */}
      <div className="bg-background">
        <EditorContent editor={editor} />
      </div>
      
      {/* Image Picker Modal */}
      <MediaPicker
        open={isImagePickerOpen}
        onOpenChange={setIsImagePickerOpen}
        onSelectMedia={handleImageSelect}
        showVideos={false}
      />
    </div>
  )
}