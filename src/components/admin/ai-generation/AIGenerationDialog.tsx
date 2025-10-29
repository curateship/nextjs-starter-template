'use client'

/**
 * AI Generation Dialog
 * Main dialog component for AI-powered content generation with chat interface
 */

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Loader2, Sparkles, Send, RefreshCw, Bot, ChevronDown, Check } from 'lucide-react'
import { generateContentBlocksAction, refineChatContentAction, applyAIBlocksToProductAction } from '@/lib/actions/ai/generation-actions'
import type { GeneratedBlock, AIMessage } from '@/lib/ai/types'
import { AI_MODELS } from '@/lib/ai/models'
import { ChatMessage } from './ChatMessage'
import { cn } from '@/lib/utils/tailwind-class-merger'

interface AIGenerationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentType: 'product' | 'page' | 'post' | 'directory'
  siteId?: string
  productId: string
  onAIComplete?: () => void
}

export function AIGenerationDialog({
  open,
  onOpenChange,
  contentType,
  siteId,
  productId,
  onAIComplete
}: AIGenerationDialogProps) {
  // Chat state
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [generatedBlocks, setGeneratedBlocks] = useState<GeneratedBlock[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'initial' | 'chat'>('initial')
  const [isLoadingExisting, setIsLoadingExisting] = useState(false)

  // Refs for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Load existing blocks when dialog opens
  useEffect(() => {
    if (open && productId) {
      loadExistingBlocks()
    }
  }, [open, productId])

  const loadExistingBlocks = async () => {
    setIsLoadingExisting(true)
    try {
      const { getProductByIdAction } = await import('@/lib/actions/products/product-actions')
      const { data: product, error } = await getProductByIdAction(productId)

      if (error || !product) {
        console.log('No existing product found or error loading')
        setIsLoadingExisting(false)
        return
      }

      // Check if product has content_blocks
      const contentBlocks = product.content_blocks as Record<string, any> | null

      if (contentBlocks && Object.keys(contentBlocks).length > 0) {
        // Valid AI block types
        const validBlockTypes = [
          'product-hero',
          'product-features',
          'product-hotspot',
          'product-pricing',
          'faq',
          'product-video',
          'rich-text'
        ]

        // Convert content_blocks object to GeneratedBlock array, filtering for valid AI blocks
        const existingBlocks: GeneratedBlock[] = Object.entries(contentBlocks)
          .filter(([type]) => validBlockTypes.includes(type))
          .map(([type, content]) => ({
            id: `${type}-${Date.now()}`,
            type: type as any,
            content
          }))

        if (existingBlocks.length > 0) {
          setGeneratedBlocks(existingBlocks)
          setMode('chat')

          // Add initial assistant message
          const assistantMessage: AIMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: `I've loaded ${existingBlocks.length} existing block${existingBlocks.length > 1 ? 's' : ''} from your product. You can ask me to make changes to them!`,
            timestamp: new Date()
          }
          setMessages([assistantMessage])
        }
      }
    } catch (err) {
      console.error('Error loading existing blocks:', err)
    } finally {
      setIsLoadingExisting(false)
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || inputMessage.trim().length < 10) {
      setError('Please provide a message (at least 10 characters)')
      return
    }

    const userMessage: AIMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    }

    // Add user message to chat
    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsGenerating(true)
    setError(null)

    try {
      // First message - generate initial blocks
      if (mode === 'initial') {
        const result = await generateContentBlocksAction({
          prompt: inputMessage,
          blockTypes: 'auto',
          modelId: selectedModel,
          contentType,
          siteId
        })

        if (result.success && result.blocks) {
          setGeneratedBlocks(result.blocks)
          setMode('chat')

          // Add assistant response
          const assistantMessage: AIMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: `I've created ${result.blocks.length} blocks for your ${contentType}. You can now ask me to make changes, like "make the title more exciting" or "add more features about security".`,
            timestamp: new Date()
          }
          setMessages(prev => [...prev, assistantMessage])
        } else {
          setError(result.error || 'Failed to generate content')
        }
      }
      // Subsequent messages - refine existing blocks
      else {
        const result = await refineChatContentAction({
          messages,
          currentBlocks: generatedBlocks,
          modelId: selectedModel,
          contentType,
          siteId,
          userMessage: inputMessage
        })

        if (result.success && result.updatedBlocks) {
          setGeneratedBlocks(result.updatedBlocks)

          // Add assistant response
          const assistantMessage: AIMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: result.message?.content || 'I\'ve updated the blocks based on your request.',
            timestamp: new Date()
          }
          setMessages(prev => [...prev, assistantMessage])
        } else {
          setError(result.error || 'Failed to refine content')

          // Add error message to chat
          const errorMessage: AIMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: `Sorry, I encountered an error: ${result.error || 'Failed to refine content'}`,
            timestamp: new Date()
          }
          setMessages(prev => [...prev, errorMessage])
        }
      }
    } catch (err) {
      setError('An unexpected error occurred')
      console.error('Generation error:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleApply = async () => {
    if (generatedBlocks.length === 0) {
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const result = await applyAIBlocksToProductAction(productId, generatedBlocks)

      if (result.success) {
        console.log(`✓ Successfully saved ${generatedBlocks.length} block${generatedBlocks.length > 1 ? 's' : ''} to database`)

        // Close dialog and trigger reload
        onOpenChange(false)
        handleReset()

        // Trigger parent reload
        if (onAIComplete) {
          onAIComplete()
        }
      } else {
        setError(result.error || 'Failed to save blocks')
        console.error('Failed to save blocks:', result.error)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      console.error('Error applying AI blocks:', errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setMessages([])
    setInputMessage('')
    setGeneratedBlocks([])
    setError(null)
    setMode('initial')
  }

  const handleCancel = () => {
    handleReset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[840px] !max-w-[95vw] max-h-[90vh] flex flex-col sm:!max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Generate Content with AI
            </div>
            {mode === 'chat' && generatedBlocks.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-muted-foreground"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Start Over
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col space-y-4 min-h-0">

          {/* Chat Messages Area */}
          <div
            ref={chatContainerRef}
            className="flex-1 rounded-lg p-4 overflow-y-auto bg-muted/20 min-h-[300px]"
          >
            {isLoadingExisting ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Loader2 className="w-12 h-12 mb-4 text-purple-500 opacity-50 animate-spin" />
                <p className="text-lg font-medium mb-2">Loading existing content...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Sparkles className="w-12 h-12 mb-4 text-purple-500 opacity-50" />
                <p className="text-lg font-medium mb-2">Start a conversation with AI</p>
                <p className="text-sm max-w-md">
                  Describe your {contentType} and I'll generate content blocks for you.
                  Then you can ask me to refine them!
                </p>
              </div>
            ) : (
              <div>
                {messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                  />
                ))}
                {isGenerating && (
                  <div className="flex gap-3 mb-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="bg-muted border rounded-lg px-4 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Generated Blocks Preview */}
          {generatedBlocks.length > 0 && (
            <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">
                  {generatedBlocks.length} Block{generatedBlocks.length > 1 ? 's' : ''} Generated
                </h3>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  View content preview
                </summary>
                <div className="mt-2 max-h-[200px] overflow-y-auto p-2 bg-background rounded border">
                  <div className="font-mono text-xs whitespace-pre-wrap break-words">
                    {generatedBlocks.map((block, index) => (
                      <div key={block.id} className="mb-4 pb-4 border-b last:border-0">
                        <div className="font-bold text-purple-600 mb-2">
                          Block {index + 1}: {block.type.toUpperCase().replace(/-/g, ' ')}
                        </div>
                        <div className="pl-2 text-xs text-muted-foreground">
                          {JSON.stringify(block.content, null, 2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* Chat Input */}
          <div className="flex items-center gap-3 border rounded-full px-4 py-2 bg-background">
            {/* Model Selector Icon */}
            <SelectPrimitive.Root
              value={selectedModel}
              onValueChange={setSelectedModel}
              disabled={isGenerating}
            >
              <SelectPrimitive.Trigger
                className="flex items-center gap-1"
              >
                <SelectPrimitive.Value>
                  <span className="text-sm font-medium">{AI_MODELS.find(m => m.id === selectedModel)?.name}</span>
                </SelectPrimitive.Value>
                <SelectPrimitive.Icon>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>

              <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                  className={cn(
                    "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
                    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                  )}
                >
                  <SelectPrimitive.Viewport className="p-1">
                    {AI_MODELS.map((model) => (
                      <SelectPrimitive.Item
                        key={model.id}
                        value={model.id}
                        className={cn(
                          "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
                          "focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        )}
                      >
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                          <SelectPrimitive.ItemIndicator>
                            <Check className="h-4 w-4" />
                          </SelectPrimitive.ItemIndicator>
                        </span>
                        <SelectPrimitive.ItemText>
                          <div className="flex items-center gap-2">
                            <span>{model.name}</span>
                            {model.badge && (
                              <span className="text-xs text-purple-500">{model.badge}</span>
                            )}
                          </div>
                        </SelectPrimitive.ItemText>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>

            {/* Divider */}
            <div className="h-6 w-px bg-border"></div>

            {/* Text Input */}
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                mode === 'initial'
                  ? `Describe your ${contentType} in detail...`
                  : 'Ask me to make changes...'
              }
              className="flex-1 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 text-sm"
              disabled={isGenerating}
            />

            {/* Send Button */}
            <Button
              onClick={handleSendMessage}
              disabled={isGenerating || inputMessage.trim().length < 10}
              size="sm"
              className="rounded-full h-8 w-8 p-0 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Actions */}
          <div className="flex justify-end items-center gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isGenerating || isSaving}
            >
              Cancel
            </Button>

            {generatedBlocks.length > 0 && (
              <Button
                onClick={handleApply}
                disabled={isSaving || isGenerating}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Apply {generatedBlocks.length} Block{generatedBlocks.length > 1 ? 's' : ''} to {contentType}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
