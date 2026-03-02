"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, Star } from "lucide-react"
import type { KeywordResearch } from "@/lib/actions/posts/keyword-actions"
import { toggleSaveKeywordAction } from "@/lib/actions/posts/keyword-actions"

interface KeywordResearchPanelProps {
  siteId: string
  seedKeyword: string
  searchTrigger: number
  onKeywordsLoaded?: (count: number) => void
  onLoadingChange?: (loading: boolean) => void
}

export function KeywordResearchPanel({ siteId, seedKeyword, searchTrigger, onKeywordsLoaded, onLoadingChange }: KeywordResearchPanelProps) {
  const [keywords, setKeywords] = useState<KeywordResearch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    if (searchTrigger === 0 || !seedKeyword.trim()) return

    async function doResearch() {
      try {
        setLoading(true)
        onLoadingChange?.(true)
        setError(null)

        const response = await fetch('/api/posts/keywords/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seedKeyword: seedKeyword.trim(), siteId }),
        })

        const result = await response.json()

        if (result.error) {
          setError(result.error)
          return
        }

        const data = result.data || []
        setKeywords(data)
        setHasSearched(true)
        onKeywordsLoaded?.(data.length)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch keyword suggestions')
      } finally {
        setLoading(false)
        onLoadingChange?.(false)
      }
    }

    doResearch()
  }, [searchTrigger])

  const handleToggleSave = async (keyword: KeywordResearch) => {
    setSavingIds(prev => new Set(prev).add(keyword.id))
    try {
      const { data, error: saveError } = await toggleSaveKeywordAction(keyword.id, !keyword.is_saved)
      if (saveError) {
        setError(saveError)
        return
      }
      if (data) {
        setKeywords(prev => prev.map(k => k.id === keyword.id ? data : k))
      }
    } catch {
      setError('Failed to save keyword')
    } finally {
      setSavingIds(prev => {
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

  if (loading) {
    return (
      <>
        <div className="px-6 py-4 border-b bg-muted/30">
          <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
            <div className="col-span-2">Keyword</div>
            <div>Volume</div>
            <div>Difficulty</div>
            <div>CPC</div>
            <div>Intent</div>
            <div>Save</div>
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
                <div><div className="h-4 bg-muted rounded animate-pulse w-12"></div></div>
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

  if (keywords.length > 0) {
    return (
      <>
        {/* Table Header */}
        <div className="px-6 py-4 border-b bg-muted/30">
          <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
            <div className="col-span-2">Keyword</div>
            <div>Volume</div>
            <div>Difficulty</div>
            <div>CPC</div>
            <div>Intent</div>
            <div>Save</div>
          </div>
        </div>

        <div className="divide-y divide-muted/80">
          {keywords.map((keyword) => (
            <div key={keyword.id} className="p-6">
              <div className="grid grid-cols-7 gap-4 items-center">
                <div className="col-span-2">
                  <span className="text-sm font-medium">{keyword.keyword}</span>
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
                  {keyword.search_intent ? (
                    <Badge variant="secondary" className="text-xs capitalize">
                      {keyword.search_intent}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleToggleSave(keyword)}
                    disabled={savingIds.has(keyword.id)}
                    title={keyword.is_saved ? 'Remove from library' : 'Save to library'}
                  >
                    <Star className={`h-4 w-4 ${keyword.is_saved ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  return (
    <div className="p-8 text-center">
      <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
      <p className="text-muted-foreground">
        {hasSearched
          ? 'No keywords found. Try a different seed keyword.'
          : 'Enter a seed keyword and click Research to discover related keywords.'
        }
      </p>
    </div>
  )
}
