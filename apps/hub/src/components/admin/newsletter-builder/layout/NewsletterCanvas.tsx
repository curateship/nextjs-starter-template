"use client"

import { Footprints } from "lucide-react"
import DOMPurify from "dompurify"
import type { NewsletterBlock } from "../config/useNewsletterBuilder"
import { renderNewsletterBlockHtml } from "@/lib/actions/newsletters/render"

interface NewsletterCanvasProps {
  blocks: NewsletterBlock[]
  previewWidth: number
  emailWidth?: number
  onSelectBlock: (block: NewsletterBlock) => void
  selectedBlock: NewsletterBlock | null
  subject?: string
  onSubjectChange?: (value: string) => void
  onSubjectClick?: () => void
}

export function NewsletterCanvas({
  blocks,
  previewWidth,
  emailWidth = 600,
  onSelectBlock,
  selectedBlock,
  subject,
  onSubjectChange,
  onSubjectClick,
}: NewsletterCanvasProps) {
  const effectiveWidth = Math.min(previewWidth, emailWidth)

  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-8">
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
      <div className="mx-auto bg-white shadow-sm overflow-hidden transition-all duration-300" style={{ maxWidth: effectiveWidth }}>
        {/* Email subject */}
        {onSubjectChange ? (
          <div
            className="canvas-block"
            style={{ padding: '20px 20px', borderBottom: '1px solid #e5e7eb' }}
          >
            <input
              type="text"
              value={subject || ''}
              onChange={e => onSubjectChange(e.target.value)}
              placeholder="Email subject line..."
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                fontSize: 16,
                fontWeight: 600,
                color: '#333',
                background: 'transparent',
              }}
            />
          </div>
        ) : subject ? (
          <div
            className="cursor-pointer canvas-block"
            style={{ padding: '20px 20px', borderBottom: '1px solid #e5e7eb' }}
            onClick={onSubjectClick}
          >
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#333' }} className="truncate">{subject}</p>
          </div>
        ) : null}

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
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(renderNewsletterBlockHtml(block), {
                    ALLOWED_TAGS: ['table', 'tbody', 'tr', 'td', 'img', 'hr', 'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote'],
                    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'src', 'alt', 'width', 'height', 'cellpadding', 'cellspacing', 'border', 'role', 'align', 'class'],
                    ALLOW_DATA_ATTR: false,
                  })
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
