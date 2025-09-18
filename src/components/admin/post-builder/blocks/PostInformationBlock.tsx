'use client'

import { useState, useEffect } from 'react'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PostBlock } from "@/lib/actions/posts/post-actions"

interface PostInformationBlockProps {
  block: PostBlock
  onContentChange: (content: Record<string, any>) => void
  postData?: {
    title?: string
    name?: string
    [key: string]: any
  }
  onPostTitleChange?: (title: string) => void
}

export function PostInformationBlock({ block, onContentChange, postData, onPostTitleChange }: PostInformationBlockProps) {
  const [showAuthor, setShowAuthor] = useState(block.content?.showAuthor ?? true)
  const [showDate, setShowDate] = useState(block.content?.showDate ?? true)

  // Local state for title editing
  const [localTitle, setLocalTitle] = useState(postData?.title || postData?.name || 'Untitled Post')

  // Update local title when post data changes
  useEffect(() => {
    setLocalTitle(postData?.title || postData?.name || 'Untitled Post')
  }, [postData?.title, postData?.name])

  useEffect(() => {
    setShowAuthor(block.content?.showAuthor ?? true)
    setShowDate(block.content?.showDate ?? true)
  }, [block.id, block.content])

  const handleTitleChange = (value: string) => {
    setLocalTitle(value)
    if (onPostTitleChange) {
      onPostTitleChange(value)
    }
  }


  const handleAuthorToggle = (checked: boolean) => {
    setShowAuthor(checked)
    onContentChange({
      ...block.content,
      showAuthor: checked,
      showDate
    })
  }

  const handleDateToggle = (checked: boolean) => {
    setShowDate(checked)
    onContentChange({
      ...block.content,
      showAuthor,
      showDate: checked
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Post Information</CardTitle>
        <CardDescription>
          Configure the post title and display options
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="post-title">Post Title</Label>
          <Input
            id="post-title"
            value={localTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Enter post title..."
            className="text-lg font-medium"
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Display Options</h3>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-author">Show Author</Label>
              <p className="text-sm text-muted-foreground">Display the post author information</p>
            </div>
            <Switch
              id="show-author"
              checked={showAuthor}
              onCheckedChange={handleAuthorToggle}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-date">Show Date</Label>
              <p className="text-sm text-muted-foreground">Display the post publication date</p>
            </div>
            <Switch
              id="show-date"
              checked={showDate}
              onCheckedChange={handleDateToggle}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}