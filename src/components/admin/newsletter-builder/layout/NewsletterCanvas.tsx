"use client"

import { ImageIcon, Footprints } from "lucide-react"
import DOMPurify from "dompurify"
import type { NewsletterBlock } from "../config/useNewsletterBuilder"

interface NewsletterCanvasProps {
  blocks: NewsletterBlock[]
  previewWidth: number
  onSelectBlock: (block: NewsletterBlock) => void
  selectedBlock: NewsletterBlock | null
  subject?: string
  onOpenSettings?: () => void
}

function CanvasRichTextBlock({ block }: { block: NewsletterBlock }) {
  return (
    <div
      style={{
        backgroundColor: block.content.backgroundColor || '#ffffff',
        padding: `${block.content.padding || 20}px`,
      }}
    >
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(block.content.htmlContent || '<p class="text-muted-foreground">Add your content here...</p>', {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote'],
            ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
            ALLOW_DATA_ATTR: false
          })
        }}
      />
    </div>
  )
}

function CanvasHeaderBlock({ block }: { block: NewsletterBlock }) {
  const { logoUrl, alignment = 'center', backgroundColor = '#ffffff', paddingTop, paddingBottom, padding = 20 } = block.content
  const pTop = paddingTop ?? padding
  const pBottom = paddingBottom ?? padding
  const align = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center'

  return (
    <div style={{ backgroundColor, padding: `${pTop}px 20px ${pBottom}px 20px`, textAlign: align as any }}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Logo"
          style={{ width: block.content.logoWidth ? `${block.content.logoWidth}px` : 100, height: block.content.logoHeight ? `${block.content.logoHeight}px` : 'auto', display: 'inline-block' }}
        />
      ) : (
        <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-lg border-2 border-dashed border-muted-foreground/30">
          <ImageIcon className="w-6 h-6 text-muted-foreground" />
        </div>
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
  subject,
  onOpenSettings,
}: NewsletterCanvasProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-8">
      <style>{`
        .canvas-block { position: relative; }
        .canvas-block::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          border: 2px dashed transparent;
          pointer-events: none;
          z-index: 9999;
          transition: border-color 0.15s;
        }
        .canvas-block:hover::after {
          border-color: #3b82f6;
        }
      `}</style>
      <div
        className="mx-auto bg-white shadow-sm rounded-sm transition-all duration-300"
        style={{ maxWidth: previewWidth }}
      >
        {/* Email subject */}
        {subject && (
          <div
            className="cursor-pointer canvas-block"
            style={{ padding: 20, borderBottom: '1px solid #e5e7eb' }}
            onClick={onOpenSettings}
          >
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#333' }} className="truncate">{subject}</p>
          </div>
        )}

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
              className="relative cursor-pointer canvas-block"
              onClick={() => onSelectBlock(block)}
            >
              {block.type === 'newsletter-header' && <CanvasHeaderBlock block={block} />}
              {block.type === 'newsletter-rich-text' && <CanvasRichTextBlock block={block} />}
              {block.type === 'newsletter-divider' && <CanvasDividerBlock block={block} />}
              {block.type === 'newsletter-footer' && <CanvasFooterBlock block={block} />}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
