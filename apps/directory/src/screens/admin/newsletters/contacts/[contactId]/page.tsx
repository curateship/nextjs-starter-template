"use client"

import { use, useState, useEffect, useCallback } from "react"
import { useRouter } from "@/lib/navigation-client"
import Link from "@/components/app-link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card, CardGroup, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CardSection } from "@/components/shared/card-sections"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { ConfirmDestructive } from "@/components/admin/layout/ConfirmDestructive"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import {
  getContactById,
  getContactStats,
  getContactEvents,
  getContactSegments,
  getContactClickedLinks,
  getContactEngagementOverTime,
  updateContact,
  deleteContacts
} from "@/lib/actions/newsletters/contact-actions"
import type { CrmContact } from "@/lib/actions/newsletters/contact-actions"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"

export default function ContactDashboardPage({ params }: { params: Promise<{ contactId: string }> }) {
  const router = useRouter()
  const { contactId } = use(params)

  // Contact data
  const [contact, setContact] = useState<CrmContact | null>(null)
  const [stats, setStats] = useState<{
    totalSent: number
    totalOpened: number
    totalClicked: number
    openRate: number
    clickRate: number
  } | null>(null)
  const [events, setEvents] = useState<
    {
      id: string
      eventType: string
      newsletterSubject: string | null
      createdAt: string
    }[]
  >([])
  const [eventsTotal, setEventsTotal] = useState(0)
  const [eventsPage, setEventsPage] = useState(1)
  const [segments, setSegments] = useState<{ id: string; name: string }[]>([])
  const [clickedLinks, setClickedLinks] = useState<
    {
      id: string
      linkUrl: string
      newsletterSubject: string | null
      createdAt: string
    }[]
  >([])
  const [engagement, setEngagement] = useState<{ month: string; opens: number; clicks: number }[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Edit form state
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    tags: "",
    status: "active"
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch all data in parallel
      const [contactRes, statsRes, eventsRes, segmentsRes, linksRes, engagementRes] = await Promise.all([
        getContactById({ data: { contactId: contactId } }),
        getContactStats({ data: { contactId: contactId } }),
        getContactEvents({ data: { contactId: contactId, page: 1, pageSize: 20 } }),
        getContactSegments({ data: { contactId: contactId } }),
        getContactClickedLinks({ data: { contactId: contactId } }),
        getContactEngagementOverTime({ data: { contactId: contactId } })
      ])

      if (contactRes.error || !contactRes.data) {
        setError(contactRes.error || "Contact not found")
        setLoading(false)
        return
      }

      setContact(contactRes.data)
      setStats(statsRes.data)
      setEvents(eventsRes.data || [])
      setEventsTotal(eventsRes.total)
      setSegments(segmentsRes.data || [])
      setClickedLinks(linksRes.data || [])
      setEngagement(engagementRes.data || [])

      // Populate edit form from contact data
      setEditForm({
        first_name: contactRes.data.metadata?.first_name || "",
        last_name: contactRes.data.metadata?.last_name || "",
        tags: contactRes.data.metadata?.tags?.join(", ") || "",
        status: contactRes.data.status
      })
    } catch {
      setError("Failed to load contact data")
    } finally {
      setLoading(false)
    }
  }, [contactId])

  useEffect(() => {
    if (contactId) loadData()
  }, [contactId, loadData])

  // Load more events (pagination)
  async function loadMoreEvents() {
    setLoadingMore(true)
    const nextPage = eventsPage + 1
    const res = await getContactEvents({ data: { contactId: contactId, page: nextPage, pageSize: 20 } })
    if (res.data) {
      setEvents((prev) => [...prev, ...res.data!])
      setEventsPage(nextPage)
    }
    setLoadingMore(false)
  }

  // Save contact edits
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!contact) return
    setSaving(true)

    const tags = editForm.tags
      ? editForm.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : []
    const { data, error } = await updateContact({ data: { contactId: contact.id, updates: {
      metadata: {
        first_name: editForm.first_name || undefined,
        last_name: editForm.last_name || undefined,
        tags
      },
      status: editForm.status as CrmContact["status"]
    } } })

    if (data) {
      setContact(data)
      showActionSuccess("Contact updated.")
    }
    if (error) setError(error)
    setSaving(false)
  }

  // Delete contact and redirect back to contacts list
  async function handleDelete() {
    if (!contact || deleting) return
    setDeleting(true)
    const { success, error } = await deleteContacts({ data: { contactIds: [contact.id] } })
    if (success) {
      router.push("/admin/newsletters/contacts")
    } else {
      setDeleteError(error || "Failed to delete contact")
      setDeleting(false)
    }
  }

  // Helper: format date relative (e.g. "3d ago") or absolute
  function formatRelativeDate(dateStr: string | null): string {
    if (!dateStr) return "Never"
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "1d ago"
    if (diffDays < 30) return `${diffDays}d ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return `${Math.floor(diffDays / 365)}y ago`
  }

  // Helper: format date for display
  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  }

  // Helper: get initials for avatar
  function getInitials(): string {
    if (!contact) return "?"
    const first = contact.metadata?.first_name?.[0] || ""
    const last = contact.metadata?.last_name?.[0] || ""
    if (first || last) return (first + last).toUpperCase()
    return contact.email[0].toUpperCase()
  }

  // Helper: get status badge
  function getStatusBadge(status: string) {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Active</Badge>
      case "cold":
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300">Cold</Badge>
      case "unsubscribed":
        return <Badge variant="secondary">Unsubscribed</Badge>
      case "bounced":
        return <Badge variant="destructive">Bounced</Badge>
      case "complained":
        return <Badge variant="destructive">Complained</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  // Helper: get source badge
  function getSourceBadge(source: string) {
    switch (source) {
      case "site_registration":
        return (
          <Badge variant="outline" className="border-amber-200 text-amber-700">
            Site Registration
          </Badge>
        )
      case "Email Form":
        return (
          <Badge variant="outline" className="border-sky-200 text-sky-700">
            Email Form
          </Badge>
        )
      case "lead_magnet":
        return <Badge variant="outline">Lead Magnet</Badge>
      case "paid_purchase":
        return (
          <Badge variant="outline" className="border-green-200 text-green-700">
            Purchase
          </Badge>
        )
      case "import":
        return (
          <Badge variant="outline" className="border-blue-200 text-blue-700">
            Import
          </Badge>
        )
      case "manual":
        return <Badge variant="outline">Manual</Badge>
      case "ad":
        return (
          <Badge variant="outline" className="border-purple-200 text-purple-700">
            Ad
          </Badge>
        )
      default:
        return <Badge variant="outline">{source}</Badge>
    }
  }

  // Helper: get event type display with color
  function getEventBadge(eventType: string) {
    switch (eventType) {
      case "sent":
        return (
          <Badge variant="secondary" className="text-xs">
            Sent
          </Badge>
        )
      case "opened":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 text-xs">Opened</Badge>
      case "clicked":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300 text-xs">Clicked</Badge>
      case "bounced":
        return (
          <Badge variant="destructive" className="text-xs">
            Bounced
          </Badge>
        )
      case "complained":
        return (
          <Badge variant="destructive" className="text-xs">
            Complained
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="text-xs">
            {eventType}
          </Badge>
        )
    }
  }

  // Contact display name
  const displayName = contact
    ? contact.metadata?.first_name || contact.metadata?.last_name
      ? `${contact.metadata.first_name || ""} ${contact.metadata.last_name || ""}`.trim()
      : contact.email
    : ""

  // Nav links (same as contacts list page)

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            className="mt-2.5"
            items={[
              { label: "Newsletters", href: "/admin/newsletters" },
              { label: "Contacts", href: "/admin/newsletters/contacts" },
              {
                label: loading ? (
                  <span className="inline-block h-4 w-32 bg-muted rounded animate-pulse align-middle" />
                ) : (
                  displayName
                )
              }
            ]}
            actions={
              <div className="flex items-center gap-2">
                <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={loading || !contact}>
                      Settings
                    </Button>
                  </DialogTrigger>
                  {contact && (
                    <form id="contact-settings-form" onSubmit={handleSave} className="contents">
                      <DashboardModalContent
                        title="Settings"
                        description="Update this contact's name, status, and tags."
                        footer={
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setSettingsOpen(false)}
                              disabled={saving}
                            >
                              Cancel
                            </Button>
                            <Button form="contact-settings-form" type="submit" disabled={saving}>
                              {saving ? "Saving..." : "Save Changes"}
                            </Button>
                          </>
                        }
                      >
                        <CardGroup className="grid">
                          <Card>
                            <CardHeader>
                              <DashboardModalCardTitle>Contact info</DashboardModalCardTitle>
                            </CardHeader>
                            <CardContent>
                              <Field>
                                <FieldLabel>First Name</FieldLabel>
                                <Input
                                  value={editForm.first_name}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      first_name: e.target.value
                                    }))
                                  }
                                  placeholder="First name"
                                />
                              </Field>
                              <Field>
                                <FieldLabel>Last Name</FieldLabel>
                                <Input
                                  value={editForm.last_name}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      last_name: e.target.value
                                    }))
                                  }
                                  placeholder="Last name"
                                />
                              </Field>
                              <Field>
                                <FieldLabel>Status</FieldLabel>
                                <Select
                                  value={editForm.status}
                                  onValueChange={(v) => setEditForm((prev) => ({ ...prev, status: v }))}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="cold">Cold</SelectItem>
                                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                                    <SelectItem value="bounced">Bounced</SelectItem>
                                    <SelectItem value="complained">Complained</SelectItem>
                                  </SelectContent>
                                </Select>
                              </Field>
                              <Field>
                                <FieldLabel>Tags</FieldLabel>
                                <Input
                                  value={editForm.tags}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      tags: e.target.value
                                    }))
                                  }
                                  placeholder="tag1, tag2, tag3"
                                />
                                <FieldDescription>Separate with commas</FieldDescription>
                              </Field>
                            </CardContent>
                          </Card>
                        </CardGroup>
                      </DashboardModalContent>
                    </form>
                  )}
                </Dialog>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDeleteError(null)
                    setDeleteConfirmOpen(true)
                  }}
                  disabled={deleting || loading}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            }
          />

          <CardGroup className="grid">
            {/* Loading skeleton */}
            {loading && (
              <>
                <Card>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
                      <div className="space-y-2">
                        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
                        <div className="h-4 w-32 bg-muted/60 rounded animate-pulse" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <CardGroup className="grid grid-cols-2 md:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                      <CardContent>
                        <div className="h-4 w-20 bg-muted rounded animate-pulse mb-2" />
                        <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                      </CardContent>
                    </Card>
                  ))}
                </CardGroup>
              </>
            )}

            {/* Error state */}
            {error && !loading && (
              <Card>
                <CardContent className="text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Link href="/admin/newsletters/contacts">
                    <Button variant="outline">Back to Contacts</Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Loaded content */}
            {!loading && contact && (
              <>
                {/* Contact Header */}
                <Card>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      {/* Avatar circle with initials */}
                      <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg shrink-0">
                        {getInitials()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-semibold truncate">{displayName}</h1>
                        <p className="text-sm text-muted-foreground truncate">{contact.email}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {getStatusBadge(contact.status)}
                        {getSourceBadge(contact.metadata?.source || "manual")}
                        <span className="text-xs text-muted-foreground">Since {formatDate(contact.created_at)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Stats cards */}
                <CardGroup className="grid grid-cols-2 md:grid-cols-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">Emails Received</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">{stats?.totalSent ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">Open Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">{stats?.openRate ?? 0}%</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">Click Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">{stats?.clickRate ?? 0}%</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">Last Engaged</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">{formatRelativeDate(contact.last_engaged_at)}</p>
                    </CardContent>
                  </Card>
                </CardGroup>

                {/* Two-column layout: Email History + Sidebar */}
                <CardGroup className="grid grid-cols-1 lg:grid-cols-3">
                  {/* Email History — left 2/3 */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="border-b">
                      <CardTitle className="text-base">Email History</CardTitle>
                    </CardHeader>
                    <div className="divide-y">
                      {events.length === 0 ? (
                        <CardSection className="text-center text-muted-foreground text-sm">
                          No email events recorded yet.
                        </CardSection>
                      ) : (
                        events.map((event) => (
                          <CardSection key={event.id}>
                            <p className="font-medium text-sm mb-1">{event.newsletterSubject || "Unknown"}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">
                                {formatDate(event.createdAt)}
                              </span>
                              <span className="text-xs text-muted-foreground">·</span>
                              {getEventBadge(event.eventType)}
                            </div>
                          </CardSection>
                        ))
                      )}
                    </div>
                    {/* Load more button */}
                    {events.length < eventsTotal && (
                      <CardSection className="border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={loadMoreEvents}
                          disabled={loadingMore}
                          className="w-full"
                        >
                          Load more ({eventsTotal - events.length} remaining)
                        </Button>
                      </CardSection>
                    )}
                  </Card>

                  {/* Right sidebar — Segments, Clicked Links */}
                  <CardGroup className="grid">
                    {/* Segments */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Segments</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {segments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Not in any segments</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {segments.map((seg) => (
                              <Badge key={seg.id} variant="secondary">
                                {seg.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Clicked Links */}
                    <Card>
                      <CardHeader className="border-b">
                        <CardTitle className="text-base">Clicked Links</CardTitle>
                      </CardHeader>
                      <div className="divide-y">
                        {clickedLinks.length === 0 ? (
                          <CardSection>
                            <p className="text-sm text-muted-foreground">No clicks recorded</p>
                          </CardSection>
                        ) : (
                          clickedLinks.map((link) => (
                            <CardSection key={link.id}>
                              <div className="flex items-start gap-2">
                                <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                  <p className="text-sm truncate">{link.linkUrl || "Unknown URL"}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {link.newsletterSubject && <span>{link.newsletterSubject} · </span>}
                                    {formatDate(link.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </CardSection>
                          ))
                        )}
                      </div>
                    </Card>
                  </CardGroup>
                </CardGroup>

                {/* Engagement Over Time chart — only if 3+ data points */}
                {engagement.length >= 3 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Engagement Over Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={engagement}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="opens" stroke="#3b82f6" name="Opens" />
                          <Line type="monotone" dataKey="clicks" stroke="#22c55e" name="Clicks" />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </CardGroup>
        </div>
      </AdminLayout>
      <ConfirmDestructive
        action="delete-contact"
        open={deleteConfirmOpen}
        title={`Delete “${contact?.email ?? "contact"}”?`}
        disabled={deleting}
        error={deleteError}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeleteError(null)
        }}
        onConfirm={handleDelete}
      />
    </>
  )
}
