/**
 * Chat Message Component
 * Displays a single chat message in the AI generation dialog
 */

import { User, Bot } from 'lucide-react'
import type { AIMessage } from '@/lib/ai/types'

interface ChatMessageProps {
  message: AIMessage
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className="flex gap-3 mb-4">
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
        }`}
      >
        {isUser ? (
          <User className="w-5 h-5" />
        ) : (
          <Bot className="w-5 h-5" />
        )}
      </div>

      {/* Message Content */}
      <div className="flex-1">
        <div
          className={`rounded-lg px-4 py-2 ${
            isUser
              ? 'bg-muted'
              : 'bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  )
}
