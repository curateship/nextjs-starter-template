"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"
export type { Newsletter }
import { getSegmentsBySite } from "@/lib/actions/newsletters/segment-actions"
import { getAudienceCount } from "@/lib/actions/newsletters/audience-sync-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { useSiteContext } from "@/contexts/site-context"
import { Users } from "lucide-react"

interface CreateNewsletterModalProps {
  onSuccess: (newsletter: Newsletter) => void
  onCancel: () => void
}

export function CreateNewsletterModal({ onSuccess, onCancel }: CreateNewsletterModalProps) {
  const { currentSite } = useSiteContext()
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Segment picker state
  const [segments, setSegments] = useState<Segment[]>([])
  const [audienceMode, setAudienceMode] = useState<string>('none')
  const [filterTags, setFilterTags] = useState('')
  const [audienceCount, setAudienceCount] = useState<number | null>(null)

  // Load segments
  useEffect(() => {
    if (!currentSite?.id) return
    getSegmentsBySite(currentSite.id).then(({ data }) => setSegments(data || []))
  }, [currentSite?.id])

  // Update audience count based on mode
  useEffect(() => {
    if (!currentSite?.id) return

    if (audienceMode === 'none') {
      setAudienceCount(null)
      return
    }

    let tags: string[] = []
    if (audienceMode === 'custom') {
      tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
    } else if (audienceMode !== 'all' && audienceMode !== 'none') {
      const seg = segments.find(s => s.id === audienceMode)
      tags = seg?.filter_rules?.tags || []
    }

    const filter = tags.length ? { tags } : {}
    getAudienceCount(currentSite.id, filter).then(({ count }) => setAudienceCount(count))
  }, [audienceMode, filterTags, currentSite?.id, segments])

  function handleAudienceModeChange(value: string) {
    setAudienceMode(value)
    if (value !== 'custom') {
      if (value === 'all' || value === 'none') {
        setFilterTags('')
      } else {
        const seg = segments.find(s => s.id === value)
        setFilterTags(seg?.filter_rules?.tags?.join(', ') || '')
      }
    }
  }

  function buildAudienceFilter(): Record<string, any> {
    if (audienceMode === 'none') return {}
    if (audienceMode === 'all') return { audience: 'all' }
    if (audienceMode === 'custom') {
      const tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
      return tags.length ? { tags } : {}
    }
    const seg = segments.find(s => s.id === audienceMode)
    const tags = seg?.filter_rules?.tags || []
    return { segment_id: audienceMode, tags }
  }

  const selectedSegment = audienceMode !== 'all' && audienceMode !== 'none' && audienceMode !== 'custom'
    ? segments.find(s => s.id === audienceMode)
    : null

  const handleCreate = async (status: 'draft' | 'scheduled') => {
    if (!subject.trim()) {
      setError('Subject line is required')
      return
    }

    if (!currentSite?.id) {
      setError('No site selected')
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: createError } = await createNewsletter({
      siteId: currentSite.id,
      name: subject.trim(),
      subject: subject.trim(),
      audience_filter: buildAudienceFilter(),
      status,
    })

    if (createError) {
      setError(createError)
      setLoading(false)
      return
    }

    if (data) {
      onSuccess(data)
    }
    setLoading(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleCreate('draft')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <div>
        <Label htmlFor="newsletter-subject">Subject Line *</Label>
        <Input
          id="newsletter-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject line"
          required
        />
      </div>

      {/* Audience */}
      <div>
        <h3 className="font-medium mb-4">Audience</h3>
        <div>
          <Label htmlFor="create-audience-select">Segment</Label>
          <Select value={audienceMode} onValueChange={handleAudienceModeChange}>
            <SelectTrigger id="create-audience-select">
              <SelectValue placeholder="Select audience" />
            </SelectTrigger>
            <SelectContent className="z-[60]">
              <SelectItem value="none">No segment</SelectItem>
              <SelectItem value="all">All Contacts</SelectItem>
              {segments.map(seg => (
                <SelectItem key={seg.id} value={seg.id}>{seg.name}</SelectItem>
              ))}
              <SelectItem value="custom">Custom filter...</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedSegment && selectedSegment.filter_rules?.tags?.length ? (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {selectedSegment.filter_rules.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        ) : null}

        {audienceMode === 'custom' && (
          <div className="mt-3">
            <Label htmlFor="create-filter-tags">Filter by Tags</Label>
            <Input
              id="create-filter-tags"
              value={filterTags}
              onChange={(e) => setFilterTags(e.target.value)}
              placeholder="austin, fitness (comma-separated)"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Only contacts with ALL these tags will receive this newsletter.
            </p>
          </div>
        )}

        {audienceMode !== 'none' && (
          <div className="flex items-center gap-2 text-sm mt-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>
              {audienceCount !== null
                ? <>{audienceCount.toLocaleString()} active contact{audienceCount !== 1 ? 's' : ''}</>
                : 'Calculating...'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center space-x-2">
          <Button
            type="submit"
            variant="outline"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save as Draft'}
          </Button>
          <Button
            type="button"
            onClick={() => handleCreate('scheduled')}
            disabled={loading}
          >
            {loading ? 'Publishing...' : 'Publish'}
          </Button>
        </div>
      </div>
    </form>
  )
}
