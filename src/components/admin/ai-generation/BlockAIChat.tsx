'use client'

/**
 * Block AI Chat
 * Inline chat interface for AI-powered content generation for individual blocks
 */

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Loader2, Send, Bot, ChevronDown, Check } from 'lucide-react'
import { AI_MODELS } from '@/lib/config/ai-models'
import { ChatMessage } from './ChatMessage'
import { cn } from '@/lib/utils/tailwind-class-merger'
import type { AIMessage } from '@/lib/ai/types'

interface BlockAIChatProps {
  blockType: 'product-features' | 'product-hero' | 'product-pricing' | 'faq' | 'product-hotspot' | 'rich-text' | 'product-video'
  currentContent: any
  onContentUpdate: (content: any) => void
  productContext?: string
}

export function BlockAIChat({
  blockType,
  currentContent,
  onContentUpdate,
  productContext
}: BlockAIChatProps) {
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

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

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsGenerating(true)
    setError(null)

    try {
      // Import the AI generation actions
      const { generateSingleBlockAction, refineChatContentAction } = await import('@/lib/actions/ai/generation-actions')

      if (messages.length === 0) {
        // First message - generate initial content
        const result = await generateSingleBlockAction({
          blockType,
          prompt: inputMessage,
          modelId: selectedModel
        })

        if (result.success && result.content) {
          onContentUpdate(result.content)

          const assistantMessage: AIMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: `I've generated content for your ${blockType.replace(/-/g, ' ')}. You can ask me to make changes!`,
            timestamp: new Date()
          }
          setMessages(prev => [...prev, assistantMessage])
        } else {
          setError(result.error || 'Failed to generate content')
        }
      } else {
        // Subsequent messages - refine existing content
        const result = await refineChatContentAction({
          messages,
          currentBlocks: [{
            id: `${blockType}-${Date.now()}`,
            type: blockType,
            content: currentContent
          }],
          modelId: selectedModel,
          contentType: 'product',
          userMessage: inputMessage
        })

        if (result.success && result.updatedBlocks && result.updatedBlocks[0]) {
          onContentUpdate(result.updatedBlocks[0].content)

          const assistantMessage: AIMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: result.message?.content || 'I\'ve updated the content based on your request.',
            timestamp: new Date()
          }
          setMessages(prev => [...prev, assistantMessage])
        } else {
          setError(result.error || 'Failed to refine content')
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

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Chat Messages Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 rounded-lg p-4 overflow-y-auto bg-muted/20 min-h-[300px] max-h-[500px]"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Bot className="w-12 h-12 mb-4 text-purple-500 opacity-50" />
            <p className="text-lg font-medium mb-2">AI-Powered Content Generation</p>
            <p className="text-sm max-w-md">
              Describe what you want for this {blockType.replace(/-/g, ' ')} and I'll generate content for you!
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

      {/* Chat Input */}
      <div className="flex items-center gap-3 border rounded-full px-4 py-2 bg-background">
        {/* Model Selector */}
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
          placeholder="Describe what you want to generate..."
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
    </div>
  )
}
