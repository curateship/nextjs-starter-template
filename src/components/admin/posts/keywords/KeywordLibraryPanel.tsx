"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, Search } from "lucide-react"
import type { KeywordResearch } from "@/lib/actions/posts/keyword-actions"
import { getSavedKeywordsAction, deleteKeywordAction } from "@/lib/actions/posts/keyword-actions"

interface KeywordLibraryPanelProps {
  siteId: string
  refreshTrigger?: number
  onCountChange?: (count: number) => void
}

export function KeywordLibraryPanel({ siteId, refreshTrigger, onCountChange }: KeywordLibraryPanelProps) {
  const [keywords, setKeywords] = useState<KeywordResearch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function loadSavedKeywords() {
      try {
        setLoading(true)
        setError(null)
        const { data, error: fetchError } = await getSavedKeywordsAction(siteId)

        if (fetchError) {
          setError(fetchError)
          return
        }

        const items = data || []
        setKeywords(items)
        onCountChange?.(items.length)
      } catch (err) {
        setError('Failed to load saved keywords')
      } finally {
        setLoading(false)
      }
    }

    loadSavedKeywords()
  }, [siteId, refreshTrigger])

  const handleDelete = async (keyword: KeywordResearch) => {
    setRemovingIds(prev => new Set(prev).add(keyword.id))
    try {
      const { error: deleteError } = await deleteKeywordAction(keyword.id)
      if (deleteError) {
        setError(deleteError)
        return
      }
      const updated = keywords.filter(k => k.id !== keyword.id)
      setKeywords(updated)
      onCountChange?.(updated.length)
    } catch {
      setError('Failed to delete keyword')
    } finally {
      setRemovingIds(prev => {
        const next = new Set(prev)
        next.delete(keyword.id)
        return next
      })
    }
  }

  const formatVolume = (volume: number | null) => {
    if (volume == null) return '—'
    return volume.toLocaleString()
  }

  const getDifficultyBadge = (difficulty: number | null) => {
    if (difficulty == null) return <span className="text-muted-foreground">—</span>
    if (difficulty < 30) {
      return <Badge variant="default" className="bg-green-100 text-green-800">{difficulty}</Badge>
    }
    if (difficulty <= 60) {
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800">{difficulty}</Badge>
    }
    return <Badge variant="default" className="bg-red-100 text-red-800">{difficulty}</Badge>
  }

  const formatCpc = (cpc: number | null) => {
    if (cpc == null) return '—'
    return `$${Number(cpc).toFixed(2)}`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
    return `${Math.ceil(diffDays / 30)} months ago`
  }

  if (loading) {
    return (
      <>
        <div className="px-6 py-4 border-b bg-muted/30">
          <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
            <div className="col-span-2">Keyword</div>
            <div>Volume</div>
            <div>Difficulty</div>
            <div>CPC</div>
            <div>Saved</div>
            <div>Actions</div>
          </div>
        </div>
        <div className="space-y-0">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-6 border-b border-muted/80">
              <div className="grid grid-cols-7 gap-4 items-center">
                <div className="col-span-2">
                  <div className="h-4 bg-muted rounded animate-pulse w-40"></div>
                </div>
                <div><div className="h-4 bg-muted rounded animate-pulse w-16"></div></div>
                <div><div className="h-6 bg-muted rounded-full animate-pulse w-12"></div></div>
                <div><div className="h-4 bg-muted rounded animate-pulse w-14"></div></div>
                <div><div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div></div>
                <div><div className="h-8 w-8 bg-muted rounded animate-pulse"></div></div>
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          Try Again
        </Button>
      </div>
    )
  }

  if (keywords.length === 0) {
    return (
      <div className="p-8 text-center">
        <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">No saved keywords yet</p>
        <p className="text-sm text-muted-foreground">
          Use the Research tab to find keywords, then click the star icon to save them to your library.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Table Header */}
      <div className="px-6 py-4 border-b bg-muted/30">
        <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
          <div className="col-span-2">Keyword</div>
          <div>Volume</div>
          <div>Difficulty</div>
          <div>CPC</div>
          <div>Saved</div>
          <div>Actions</div>
        </div>
      </div>

      <div className="divide-y divide-muted/80">
        {keywords.map((keyword) => (
          <div key={keyword.id} className="p-6">
            <div className="grid grid-cols-7 gap-4 items-center">
              <div className="col-span-2">
                <span className="text-sm font-medium">{keyword.keyword}</span>
                {keyword.search_intent && (
                  <Badge variant="secondary" className="text-xs capitalize ml-2">
                    {keyword.search_intent}
                  </Badge>
                )}
              </div>
              <div>
                <span className="text-sm">{formatVolume(keyword.search_volume)}</span>
              </div>
              <div>
                {getDifficultyBadge(keyword.keyword_difficulty)}
              </div>
              <div>
                <span className="text-sm">{formatCpc(keyword.cpc)}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">
                  {formatDate(keyword.updated_at)}
                </span>
              </div>
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleDelete(keyword)}
                  disabled={removingIds.has(keyword.id)}
                  title="Delete keyword"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
