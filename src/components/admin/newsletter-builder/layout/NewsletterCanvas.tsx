"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import { ImageIcon, Footprints } from "lucide-react"
import { useEffect } from "react"
import type { NewsletterBlock } from "../config/useNewsletterBuilder"

interface NewsletterCanvasProps {
  blocks: NewsletterBlock[]
  previewWidth: number
  onSelectBlock: (block: NewsletterBlock) => void
  selectedBlock: NewsletterBlock | null
  onUpdateBlockContent: (blockId: string, field: string, value: any) => void
}

function CanvasRichTextBlock({ block, onUpdateContent }: { block: NewsletterBlock; onUpdateContent: (field: string, value: any) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: block.content.htmlContent || '',
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onUpdateContent('htmlContent', editor.getHTML())
    },
  })

  useEffect(() => {
    if (editor && block.content.htmlContent !== editor.getHTML()) {
      editor.commands.setContent(block.content.htmlContent || '')
    }
  }, [block.id])

  if (!editor) return <div className="p-4 text-muted-foreground">Loading editor...</div>

  return (
    <div
      className="cursor-text"
      style={{
        backgroundColor: block.content.backgroundColor || '#ffffff',
        padding: `${block.content.padding || 20}px`,
      }}
      onClick={() => {
        if (!editor.isFocused) editor.commands.focus()
      }}
    >
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none [&_.ProseMirror]:border-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:shadow-none [&_.ProseMirror]:p-0 min-h-[40px]"
      />
    </div>
  )
}

function CanvasHeaderBlock({ block }: { block: NewsletterBlock }) {
  const { logoUrl, siteName, showSiteName, alignment = 'center', backgroundColor = '#ffffff', padding = 20 } = block.content
  const align = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center'

  return (
    <div style={{ backgroundColor, padding: `${padding}px`, textAlign: align as any }}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={siteName || 'Logo'}
          style={{ maxWidth: 200, height: 'auto', display: 'inline-block' }}
        />
      ) : (
        <div
          className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-lg border-2 border-dashed border-muted-foreground/30"
        >
          <ImageIcon className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
      {showSiteName !== false && siteName && (
        <h1 style={{ margin: logoUrl ? '12px 0 0 0' : '0', fontSize: 24, fontWeight: 'bold', color: '#333' }}>
          {siteName}
        </h1>
      )}
    </div>
  )
}

function CanvasDividerBlock({ block }: { block: NewsletterBlock }) {
  const { color = '#e5e7eb', thickness = 1, width = 100, spacing = 20 } = block.content
  return (
    <div style={{ padding: `${spacing}px 0`, textAlign: 'center' }}>
      <hr style={{ border: 'none', borderTop: `${thickness}px solid ${color}`, width: `${width}%`, margin: '0 auto' }} />
    </div>
  )
}

function CanvasFooterBlock({ block }: { block: NewsletterBlock }) {
  const { companyName = '', companyAddress = '', showUnsubscribe = true, alignment = 'center' } = block.content
  const align = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center'

  return (
    <div style={{ padding: 20, textAlign: align as any, fontSize: 12, color: '#999' }}>
      {companyName && <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>{companyName}</p>}
      {companyAddress && <p style={{ margin: '0 0 12px 0' }}>{companyAddress}</p>}
      {showUnsubscribe && (
        <p style={{ margin: 0 }}>
          <span className="underline cursor-default">Unsubscribe</span>
        </p>
      )}
    </div>
  )
}

export function NewsletterCanvas({
  blocks,
  previewWidth,
  onSelectBlock,
  selectedBlock,
  onUpdateBlockContent,
}: NewsletterCanvasProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-8">
      <div
        className="mx-auto bg-white shadow-sm rounded-sm transition-all duration-300"
        style={{ maxWidth: previewWidth }}
      >
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Footprints className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-base font-medium">Empty newsletter</p>
            <p className="text-sm">Add blocks to start building your email</p>
          </div>
        ) : (
          blocks.map(block => (
            <div
              key={block.id}
              className={`relative cursor-pointer border-2 transition-colors ${
                selectedBlock?.id === block.id
                  ? 'border-primary'
                  : 'border-transparent hover:border-primary/30'
              }`}
              onClick={(e) => {
                // Don't select if clicking inside an editor
                if ((e.target as HTMLElement).closest('.ProseMirror')) return
                onSelectBlock(block)
              }}
            >
              {block.type === 'newsletter-header' && <CanvasHeaderBlock block={block} />}
              {block.type === 'newsletter-rich-text' && (
                <CanvasRichTextBlock block={block} onUpdateContent={(field, value) => onUpdateBlockContent(block.id, field, value)} />
              )}
              {block.type === 'newsletter-divider' && <CanvasDividerBlock block={block} />}
              {block.type === 'newsletter-footer' && <CanvasFooterBlock block={block} />}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
