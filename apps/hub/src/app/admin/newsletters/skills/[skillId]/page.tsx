"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getNewsletterAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Play, Check, X, Pencil, ExternalLink, Wand2, Settings,
  Mail, Users, Filter, Zap, FileText
} from "lucide-react"
import {
  getSkillById,
  getSkillOutputs,
  approveOutput,
  rejectOutput,
  updateOutput,
  generateOneOutput,
} from "@/lib/actions/newsletters/skill-actions"
import { generateOutline } from "@/lib/actions/ai/newsletter-ai-actions"
import { isAIProvider } from "@/lib/utils/ai-models"
import type { NewsletterSkill, NewsletterSkillOutput } from "@/lib/actions/newsletters/skill-actions"
import { useSiteSwitcher } from "@/components/admin/layout/site-switcher-provider"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import { SkillModal } from "@/components/admin/newsletter-skills/SkillModal"

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

export default function SkillOutputsPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteSwitcher()
  const skillId = params.skillId as string
  const autoRun = searchParams.get('run') === 'true'

  const [skill, setSkill] = useState<NewsletterSkill | null>(null)
  const [outputs, setOutputs] = useState<NewsletterSkillOutput[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [runningSkill, setRunningSkill] = useState(false)
  const [runProgress, setRunProgress] = useState('')

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingOutput, setEditingOutput] = useState<NewsletterSkillOutput | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  // Action loading states
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [skillModalOpen, setSkillModalOpen] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [skillId])

  // Auto-run if navigated with ?run=true
  const [hasAutoRun, setHasAutoRun] = useState(false)
  useEffect(() => {
    if (autoRun && skill && !hasAutoRun && !runningSkill) {
      setHasAutoRun(true)
      // Clear the query param so refresh doesn't re-trigger
      router.replace(`/admin/newsletters/skills/${skillId}`)
      handleRun()
    }
  }, [autoRun, skill, hasAutoRun])

  // Load skill info and its outputs
  async function loadData() {
    try {
      setLoading(true)
      setError(null)

      const [skillResult, outputsResult] = await Promise.all([
        getSkillById(skillId),
        getSkillOutputs(skillId),
      ])

      if (skillResult.error) {
        setError(skillResult.error)
        setLoading(false)
        return
      }

      setSkill(skillResult.data)
      setOutputs(outputsResult.data || [])
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
      setLoading(false)
    }
  }

  // Run the skill — two phases:
  // 1. Generate an outline (sequence plan) — AI decides how many from the prompt
  // 2. Generate each newsletter body one at a time using its assigned topic
  async function handleRun() {
    if (!skill) return
    setRunningSkill(true)
    setError(null)

    // Phase 1: Generate the outline
    setRunProgress('Planning sequence...')
    const { data: topics, error: outlineError } = await generateOutline(
      skill.site_id,
      {
        prompt: skill.prompt,
        voiceGuide: skill.reference_text || undefined,
        provider: isAIProvider(skill.settings?.provider) ? skill.settings.provider : undefined,
        model: skill.settings?.model,
        temperature: skill.settings?.temperature,
      }
    )

    if (outlineError || !topics?.length) {
      setError(outlineError || 'No topics generated')
      setRunningSkill(false)
      setRunProgress('')
      return
    }

    // Phase 2: Generate each newsletter using the outline
    const totalCount = topics.length
    let generated = 0
    const errors: string[] = []

    for (let i = 1; i <= totalCount; i++) {
      setRunProgress(`Generating ${i} of ${totalCount}...`)
      const { data: output, error: genError } = await generateOneOutput(skillId, i, totalCount, topics[i - 1])

      if (genError) {
        errors.push(`#${i}: ${genError}`)
        continue
      }

      if (output) {
        setOutputs(prev => [output, ...prev])
        generated++
      }
    }

    setRunningSkill(false)
    setRunProgress('')

    if (errors.length) {
      setError(`Generated ${generated} of ${totalCount}. Errors: ${errors.join('; ')}`)
    }
  }

  // Approve an output — creates a draft newsletter
  async function handleApprove(outputId: string) {
    setApprovingId(outputId)
    const { data, error: approveError } = await approveOutput(outputId)
    setApprovingId(null)

    if (approveError) {
      setError(approveError)
      return
    }

    loadData()
  }

  // Reject an output
  async function handleReject(outputId: string) {
    setRejectingId(outputId)
    const { error: rejectError } = await rejectOutput(outputId)
    setRejectingId(null)

    if (rejectError) {
      setError(rejectError)
      return
    }

    loadData()
  }

  // Open edit modal for an output
  function handleEdit(output: NewsletterSkillOutput) {
    setEditingOutput(output)
    setEditSubject(output.subject)
    // Extract HTML content from the first rich-text block for editing
    const blocks = Object.values(output.content_blocks || {}) as any[]
    const richTextBlock = blocks.find((b: any) => b.type === 'newsletter-rich-text')
    setEditContent(richTextBlock?.content?.htmlContent || '')
    setEditModalOpen(true)
  }

  // Save edits to an output
  async function handleSaveEdit() {
    if (!editingOutput) return
    setSaving(true)

    // Rebuild content_blocks with the edited content
    const updatedBlocks = { ...editingOutput.content_blocks }
    const blockEntries = Object.entries(updatedBlocks) as [string, any][]
    const richTextEntry = blockEntries.find(([, b]) => b.type === 'newsletter-rich-text')
    if (richTextEntry) {
      updatedBlocks[richTextEntry[0]] = {
        ...richTextEntry[1],
        content: { ...richTextEntry[1].content, htmlContent: editContent },
      }
    }

    const { error: updateError } = await updateOutput(editingOutput.id, {
      subject: editSubject,
      content_blocks: updatedBlocks,
    })

    setSaving(false)

    if (updateError) {
      setError(updateError)
      return
    }

    setEditModalOpen(false)
    loadData()
  }

  // Filter outputs by status
  const filteredOutputs = statusFilter === 'all'
    ? outputs
    : outputs.filter(o => o.status === statusFilter)

  // Count by status
  const counts = {
    all: outputs.length,
    pending: outputs.filter(o => o.status === 'pending').length,
    approved: outputs.filter(o => o.status === 'approved').length,
    rejected: outputs.filter(o => o.status === 'rejected').length,
  }

  // Extract preview text from content blocks
  function getPreviewText(contentBlocks: Record<string, any>): string {
    const blocks = Object.values(contentBlocks || {}) as any[]
    const richText = blocks.find((b: any) => b.type === 'newsletter-rich-text')
    if (!richText?.content?.htmlContent) return 'No content'
    // Strip HTML tags and truncate
    const text = richText.content.htmlContent.replace(/<[^>]+>/g, '')
    return text.length > 120 ? text.substring(0, 120) + '...' : text
  }

  // Status badge styling
  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending': return <Badge variant="secondary">Pending</Badge>
      case 'approved': return <Badge className="bg-green-600">Approved</Badge>
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  }

  return (
    <>
      <StickyHeader navLinks={getNewsletterAdminTopNavLinks()} />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: "Newsletters", href: "/admin/newsletters" },
              { label: "Create with AI", href: "/admin/newsletters/skills" },
              { label: skill?.name || <span className="inline-block h-4 w-32 bg-muted rounded animate-pulse align-middle" /> },
            ]}
            actions={
              <Button
                onClick={handleRun}
                disabled={runningSkill}
              >
                {runningSkill ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span className="ml-1">{runProgress || 'Running...'}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span className="ml-1">Run Skill</span>
                  </>
                )}
              </Button>
            }
          />

          {/* Error display */}
          {error && (
            <div className="mx-4 mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400">
              {error}
              <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
            </div>
          )}

          {/* Skill summary card */}
          <Card className="mx-4 mb-6 p-4">
            {skill ? (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-medium text-sm mb-1">{skill.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">{skill.prompt}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    {skill.settings?.model && <span>{skill.settings.model}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 shrink-0"
                  onClick={() => setSkillModalOpen(true)}
                  title="Edit Skill"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div>
                <div className="h-4 bg-muted rounded animate-pulse w-48 mb-2" />
                <div className="h-3 bg-muted/60 rounded animate-pulse w-80 mb-2" />
                <div className="h-3 bg-muted/60 rounded animate-pulse w-24" />
              </div>
            )}
          </Card>

          {/* Status filter tabs */}
          <div className="mx-4 mb-4">
            <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <TabsList className="h-9 p-1 gap-1">
                <TabsTrigger value="all" className="px-3">All{counts.all > 0 && ` (${counts.all})`}</TabsTrigger>
                <TabsTrigger value="pending" className="px-3">Pending{counts.pending > 0 && ` (${counts.pending})`}</TabsTrigger>
                <TabsTrigger value="approved" className="px-3">Approved{counts.approved > 0 && ` (${counts.approved})`}</TabsTrigger>
                <TabsTrigger value="rejected" className="px-3">Rejected{counts.rejected > 0 && ` (${counts.rejected})`}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Outputs list */}
          {loading ? (
            <Card className="shadow-sm">
              <div className="divide-y divide-muted/80">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-4 bg-muted rounded animate-pulse w-64 mb-2" />
                        <div className="h-3 bg-muted/60 rounded animate-pulse w-80" />
                      </div>
                      <div className="flex gap-1">
                        <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                        <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                        <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : filteredOutputs.length === 0 ? (
            <Card className="p-8 text-center">
              <Wand2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                {outputs.length === 0
                  ? 'No outputs yet. Click "Run Skill" to generate newsletters.'
                  : `No ${statusFilter} outputs.`}
              </p>
              {outputs.length === 0 && (
                <Button onClick={handleRun} disabled={runningSkill} variant="outline">
                  <Play className="h-4 w-4 mr-1" />
                  Run Skill
                </Button>
              )}
            </Card>
          ) : (
            <Card className="shadow-sm">
              <div className="divide-y divide-muted/80">
                {filteredOutputs.map((output) => (
                  <div key={output.id} className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      {/* Output info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm">{output.subject}</h4>
                          {getStatusBadge(output.status)}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {getPreviewText(output.content_blocks)}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(output.created_at)}</span>
                          {output.newsletter_id && (
                            <a
                              href={`/admin/newsletters/${output.newsletter_id}`}
                              className="flex items-center gap-1 text-blue-600 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Draft
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Action buttons — only show for pending outputs */}
                      {output.status === 'pending' && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleEdit(output)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApprove(output.id)}
                            disabled={approvingId === output.id}
                            title="Approve — creates a draft newsletter"
                            className="text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950/20"
                          >
                            {approvingId === output.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                            onClick={() => handleReject(output.id)}
                            disabled={rejectingId === output.id}
                            title="Reject"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </AdminLayout>

      {/* Edit Output Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="w-[840px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col p-10" style={{ width: '840px', maxWidth: '95vw' }}>
          <DialogHeader>
            <DialogTitle>Edit Output</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 min-h-0 flex flex-col flex-1">
            <div className="shrink-0">
              <Label htmlFor="edit-subject">Subject Line</Label>
              <Input
                id="edit-subject"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Newsletter subject..."
              />
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <Label className="shrink-0">Content</Label>
              <div className="mt-1 flex-1 min-h-0 overflow-y-auto builder-scroll">
                <RichTextEditor
                  content={{ content: editContent, hideHeader: true, hideEditorHeader: true }}
                  onContentChange={(updated) => setEditContent(updated.content)}
                  inline
                  placeholder="Start writing..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 shrink-0">
              <Button variant="outline" onClick={() => setEditModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={saving || !editSubject.trim()}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Skill Modal */}
      <SkillModal
        open={skillModalOpen}
        onOpenChange={setSkillModalOpen}
        skill={skill}
        siteId={currentSite?.id || ''}
        onSaved={loadData}
      />
    </>
  )
}
