"use client"

import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { Footprints, Settings } from "lucide-react"
import DOMPurify from "dompurify"
import type { NewsletterBlock } from "../config/useNewsletterBuilder"
import { renderNewsletterBlockHtml } from "@/lib/actions/newsletters/render"
import { NewsletterInlineRichTextEditor } from "./NewsletterInlineRichTextEditor"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils/tailwind"

interface NewsletterCanvasProps {
  blocks: NewsletterBlock[]
  previewWidth: number
  emailWidth?: number
  siteId: string
  onSelectBlock: (block: NewsletterBlock) => void
  subject?: string
  onSubjectChange?: (value: string) => void
  onSubjectClick?: () => void
  editingBlockId?: string | null
  onStartInlineEdit?: (blockId: string) => void
  onStopInlineEdit?: () => void
  onUpdateInlineRichText?: (blockId: string, htmlContent: string) => void
  onOpenBlockSettings?: (block: NewsletterBlock) => void
}

export function NewsletterCanvas({
  blocks,
  previewWidth,
  emailWidth = 600,
  siteId,
  onSelectBlock,
  subject,
  onSubjectChange,
  onSubjectClick,
  editingBlockId = null,
  onStartInlineEdit,
  onStopInlineEdit,
  onUpdateInlineRichText,
  onOpenBlockSettings,
}: NewsletterCanvasProps) {
  const effectiveWidth = Math.min(previewWidth, emailWidth)
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null)
  const [isSubjectFocused, setIsSubjectFocused] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  const handleBlockClick = (event: ReactMouseEvent<HTMLDivElement>, block: NewsletterBlock) => {
    const target = event.target as HTMLElement

    if (target.closest("a")) {
      event.preventDefault()
    }

    if (block.type === "newsletter-rich-text") {
      if (editingBlockId === block.id) {
        return
      }

      onStartInlineEdit?.(block.id)
      return
    }

    onStopInlineEdit?.()
    onSelectBlock(block)
  }

  return (
    <ScrollArea className="h-full bg-muted/30" viewportRef={scrollContainerRef}>
      <style>{`
        .canvas-block { position: relative; }
        .canvas-block::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          border: 2px dashed transparent;
          pointer-events: none;
          z-index: 10;
          transition: border-color 0.15s;
        }
        .canvas-block:hover::after {
          border-color: #3b82f6;
        }
        .canvas-block.is-editing::after {
          border-color: #d1d5db;
        }
      `}</style>
      <div className="p-8">
        <div className="mx-auto bg-white shadow-sm overflow-hidden transition-all duration-300" style={{ maxWidth: effectiveWidth }}>
          {/* Email subject */}
          {onSubjectChange ? (
            <div
              className={cn(
                "canvas-block",
                isSubjectFocused && "is-editing",
              )}
              style={{ padding: '20px 20px', borderBottom: '1px solid #e5e7eb' }}
            >
              <input
                type="text"
                value={subject || ''}
                onChange={e => onSubjectChange(e.target.value)}
                onFocus={() => setIsSubjectFocused(true)}
                onBlur={() => setIsSubjectFocused(false)}
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
                className={cn(
                  "canvas-block",
                  block.type === "newsletter-rich-text" ? "cursor-text" : "cursor-pointer",
                  block.type === "newsletter-rich-text" && editingBlockId === block.id && "is-editing",
                )}
                data-newsletter-inline-editor-shell={block.type === "newsletter-rich-text" && editingBlockId === block.id ? "true" : undefined}
                onMouseEnter={() => setHoveredBlockId(block.id)}
                onMouseLeave={() => setHoveredBlockId(current => current === block.id ? null : current)}
                onClick={(event) => handleBlockClick(event, block)}
              >
                {block.type === "newsletter-rich-text" && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className={cn(
                      "absolute right-3 top-3 z-20 h-8 w-8 rounded-full border bg-background/90 shadow-sm transition-opacity",
                      hoveredBlockId === block.id || editingBlockId === block.id ? "opacity-100" : "opacity-0",
                    )}
                    data-newsletter-settings-button="true"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onStopInlineEdit?.()
                      onOpenBlockSettings?.(block)
                    }}
                    title="Open block settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                )}

                {block.type === "newsletter-rich-text" ? (
                  <NewsletterInlineRichTextEditor
                    blockId={block.id}
                    content={block.content}
                    onContentChange={(htmlContent) => onUpdateInlineRichText?.(block.id, htmlContent)}
                    siteId={siteId}
                    scrollTarget={scrollContainerRef.current}
                    isActive={editingBlockId === block.id}
                  />
                ) : (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(renderNewsletterBlockHtml(block), {
                        ALLOWED_TAGS: ['table', 'tbody', 'tr', 'td', 'img', 'hr', 'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote'],
                        ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'src', 'alt', 'width', 'height', 'cellpadding', 'cellspacing', 'border', 'role', 'align', 'class'],
                        ALLOW_DATA_ATTR: false,
                      })
                    }}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
