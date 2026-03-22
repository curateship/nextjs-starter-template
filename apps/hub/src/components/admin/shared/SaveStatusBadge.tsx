"use client"

import { CheckCircle, AlertCircle } from "lucide-react"

interface SaveStatusBadgeProps {
  message: string | null | undefined
}

/**
 * Displays a save status message badge (green for success, red for errors).
 * Used in builder StickyHeaders and other components that show save feedback.
 */
export function SaveStatusBadge({ message }: SaveStatusBadgeProps) {
  if (!message) return null

  const isError = message.includes('Error') || message.includes('Failed')
  const Icon = isError ? AlertCircle : CheckCircle

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${
      isError
        ? 'bg-red-50 border border-red-200'
        : 'bg-green-50 border border-green-200'
    }`}>
      <Icon className={`w-4 h-4 ${isError ? 'text-red-600' : 'text-green-600'}`} />
      <span className={`text-sm font-medium ${isError ? 'text-red-800' : 'text-green-700'}`}>
        {message}
      </span>
    </div>
  )
}
