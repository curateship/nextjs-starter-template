"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/post-builder/layout/StickyHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import {
  getNewsletterById,
  updateNewsletter,
  sendNewsletter,
  sendTestNewsletter,
} from "@/lib/actions/newsletters/newsletter-actions"
import { getAudienceCount } from "@/lib/actions/newsletters/audience-sync-actions"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { useSiteContext } from "@/contexts/site-context"
import { Send, TestTube, Users } from "lucide-react"

interface PageProps {
  params: Promise<{ newsletterId: string }>
}

export default function NewsletterComposerPage({ params }: PageProps) {
  const { newsletterId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteContext()

  const [newsletter, setNewsletter] = useState<Newsletter | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [audienceCount, setAudienceCount] = useState<number | null>(null)

  // Form state
  const [name, setName] = useState("")
  const [subject, setSubject] = useState("")
  const [editorContent, setEditorContent] = useState({ content: "" })
  const [testEmail, setTestEmail] = useState("")
  const [filterTags, setFilterTags] = useState("")

  // Confirm send dialog
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)

  useEffect(() => {
    loadBroadcast()
  }, [newsletterId])

  async function loadBroadcast() {
    setLoading(true)
    const { data, error } = await getNewsletterById(newsletterId)
    if (error || !data) {
      setError(error || "Not found")
      setLoading(false)
      return
    }
    setNewsletter(data)
    setName(data.name)
    setSubject(data.subject)
    setEditorContent({ content: data.content || "" })
    setFilterTags(data.audience_filter?.tags?.join(", ") || "")
    setLoading(false)

    // Load audience count
    if (currentSite?.id) {
      const { count } = await getAudienceCount(currentSite.id, data.audience_filter || {})
      setAudienceCount(count)
    }
  }

  useEffect(() => {
    if (!currentSite?.id) return
    const tags = filterTags ? filterTags.split(",").map(t => t.trim()).filter(Boolean) : []
    const filter = tags.length ? { tags } : {}
    getAudienceCount(currentSite.id, filter).then(({ count }) => setAudienceCount(count))
  }, [filterTags, currentSite?.id])

  const handleSave = async () => {
    if (!newsletter) return
    setSaving(true)
    setError(null)
    setSaveMessage(null)

    const tags = filterTags ? filterTags.split(",").map(t => t.trim()).filter(Boolean) : []
    const audienceFilter = tags.length ? { tags } : {}

    const { data, error } = await updateNewsletter(newsletter.id, {
      name: name.trim(),
      subject: subject.trim() || name.trim(),
      content: editorContent.content,
      audience_filter: audienceFilter,
    })

    if (error) {
      setError(error)
    } else if (data) {
      setNewsletter(data)
      setSaveMessage("Saved")
      setTimeout(() => setSaveMessage(null), 3000)
    }
    setSaving(false)
  }

  const handleSend = async () => {
    if (!newsletter) return
    setConfirmSendOpen(false)
    setSending(true)
    setError(null)

    // Save first
    await handleSave()

    const { success, error } = await sendNewsletter(newsletter.id)
    if (error) {
      setError(error)
    } else if (success) {
      setSaveMessage("Newsletter sent!")
      // Reload to get updated status
      loadBroadcast()
    }
    setSending(false)
  }

  const handleSendTest = async () => {
    if (!newsletter || !testEmail) return
    setSendingTest(true)
    setError(null)

    // Save first
    await handleSave()

    const { success, error } = await sendTestNewsletter(newsletter.id, testEmail)
    if (error) {
      setError(error)
    } else if (success) {
      setSaveMessage("Test email sent!")
      setTimeout(() => setSaveMessage(null), 3000)
    }
    setSendingTest(false)
  }

  const isSent = newsletter?.status === 'sent' || newsletter?.status === 'sending'

  if (loading) {
    return (
      <>
        <StickyHeader breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/newsletters", label: "Newsletters" },
          { label: "Loading...", isPage: true },
        ]} />
        <AdminLayout>
          <div className="w-full p-8 text-center text-muted-foreground">Loading...</div>
        </AdminLayout>
      </>
    )
  }

  if (error && !newsletter) {
    return (
      <>
        <StickyHeader breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/newsletters", label: "Newsletters" },
          { label: "Error", isPage: true },
        ]} />
        <AdminLayout>
          <div className="w-full p-8 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => router.push("/admin/newsletters")} variant="outline">Back to Newsletters</Button>
          </div>
        </AdminLayout>
      </>
    )
  }

  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/newsletters", label: "Newsletters" },
          { label: name || "Compose", isPage: true },
        ]}
      />
      <AdminLayout>
        <div className="w-full max-w-4xl mx-auto px-6 py-6 space-y-6">
          <AdminPageHeader
            title={name || "Compose Newsletter"}
            backUrl="/admin/newsletters"
            extraContent={
              <div className="flex items-center gap-2">
                {saveMessage && (
                  <span className="text-sm text-green-600">{saveMessage}</span>
                )}
                {isSent ? (
                  <Badge className="bg-green-100 text-green-800">Sent</Badge>
                ) : (
                  <>
                    <Button variant="outline" onClick={handleSave} disabled={saving}>
                      {saving ? "Saving..." : "Save Draft"}
                    </Button>
                    <Button onClick={() => setConfirmSendOpen(true)} disabled={sending || !editorContent.content.trim()}>
                      <Send className="h-4 w-4 mr-2" />
                      {sending ? "Sending..." : "Send"}
                    </Button>
                  </>
                )}
              </div>
            }
          />
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Name & Subject */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="newsletter-name">Newsletter Name</Label>
              <Input
                id="newsletter-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Internal name"
                disabled={isSent}
              />
            </div>
            <div>
              <Label htmlFor="newsletter-subject">Subject Line</Label>
              <Input
                id="newsletter-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What recipients see in their inbox"
                disabled={isSent}
              />
            </div>
          </div>

          {/* Content Editor */}
          <div>
            <Label>Content</Label>
            <div className="mt-1">
              <RichTextEditor
                content={{ ...editorContent, hideHeader: true, hideEditorHeader: true }}
                onContentChange={(c) => setEditorContent({ content: c.content })}
              />
            </div>
          </div>

          {/* Audience & Send */}
          <Card className="p-6 space-y-4">
            <h3 className="font-medium">Audience</h3>

            <div>
              <Label htmlFor="filter-tags">Filter by Tags (optional)</Label>
              <Input
                id="filter-tags"
                value={filterTags}
                onChange={(e) => setFilterTags(e.target.value)}
                placeholder="austin, fitness (comma-separated, leave empty for all)"
                disabled={isSent}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only contacts with ALL these tags will receive this newsletter. Leave empty to send to all active contacts.
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>
                {audienceCount !== null ? (
                  <>{audienceCount.toLocaleString()} active contact{audienceCount !== 1 ? "s" : ""} will receive this</>
                ) : (
                  "Calculating audience..."
                )}
              </span>
            </div>

            {/* Test Email */}
            {!isSent && (
              <div className="flex items-end gap-2 pt-2 border-t">
                <div className="flex-1">
                  <Label htmlFor="test-email">Send Test Email</Label>
                  <Input
                    id="test-email"
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="your@email.com"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleSendTest}
                  disabled={sendingTest || !testEmail}
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  {sendingTest ? "Sending..." : "Send Test"}
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Confirm Send Dialog */}
        {confirmSendOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmSendOpen(false)} />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Send Newsletter</h2>
              <p className="text-sm text-muted-foreground mb-4">
                This will send &quot;{subject || name}&quot; to {audienceCount?.toLocaleString() || "all"} active contacts. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button onClick={() => setConfirmSendOpen(false)} variant="outline">Cancel</Button>
                <Button onClick={handleSend} disabled={sending}>
                  {sending ? "Sending..." : "Send Now"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </>
  )
}
