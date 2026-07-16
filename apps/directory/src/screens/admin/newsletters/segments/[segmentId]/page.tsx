"use client"

import { useState, useEffect, useCallback, type FormEvent } from "react"
import { useParams, useRouter } from "@/lib/navigation-client"
import Link from "@/components/app-link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card, CardGroup, CardContent, CardDescription, CardHeader, CardSection, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { ConfirmDestructive } from "@/components/admin/layout/ConfirmDestructive"
import Filter from "lucide-react/dist/esm/icons/funnel.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import X from "lucide-react/dist/esm/icons/x.js"
import Search from "lucide-react/dist/esm/icons/search.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import {
  getSegmentById,
  getSegmentStats,
  getSegmentContacts,
  getSegmentEngagementOverTime,
  getSegmentNewsletters,
  searchContactsForSegment,
  updateSegment,
  deleteSegments,
  removeContactsFromSegment,
  addContactsToSegment,
  getAvailableSegmentTags,
  getSegmentsBySite
} from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { formatSegmentDynamicRule, type SegmentType } from "@/lib/actions/newsletters/segment-rules"
import {
  buildDynamicRuleFromForm,
  mapDynamicRuleToForm,
  SegmentDynamicConditionEditor,
  type DynamicConditionForm
} from "@/components/admin/newsletter-builder/segments/SegmentDynamicConditionEditor"

export default function SegmentDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const segmentId = params.segmentId as string

  // Segment data
  const [segment, setSegment] = useState<Segment | null>(null)
  const [stats, setStats] = useState<{
    totalContacts: number
    totalSent: number
    totalOpened: number
    totalClicked: number
    openRate: number
    clickRate: number
    unsubscribeRate: number
  } | null>(null)
  const [contacts, setContacts] = useState<
    {
      id: string
      email: string
      status: string
      metadata: any
      createdAt: string
    }[]
  >([])
  const [contactsTotal, setContactsTotal] = useState(0)
  const [contactsPage, setContactsPage] = useState(1)
  const [newsletters, setNewsletters] = useState<
    {
      id: string
      name: string
      subject: string
      status: string
      sentAt: string | null
      totalSent: number
      totalOpened: number
      totalClicked: number
    }[]
  >([])
  const [engagement, setEngagement] = useState<{ month: string; opens: number; clicks: number }[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    segmentType: "static" as SegmentType
  })
  const [dynamicConditions, setDynamicConditions] = useState<DynamicConditionForm[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [segmentOptions, setSegmentOptions] = useState<Segment[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [contactToRemove, setContactToRemove] = useState<{ id: string; email: string } | null>(null)
  const [removeContactError, setRemoveContactError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Search contacts state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<{ id: string; email: string; metadata: any }[]>([])
  const [searching, setSearching] = useState(false)
  const [addingContact, setAddingContact] = useState<string | null>(null)

  // Load all data on mount
  useEffect(() => {
    if (!segment?.site_id) {
      setAvailableTags([])
      setSegmentOptions([])
      return
    }

    Promise.all([getAvailableSegmentTags(segment.site_id), getSegmentsBySite(segment.site_id, { pageSize: 100 })]).then(
      ([tagsRes, segmentsRes]) => {
        setAvailableTags(tagsRes.data || [])
        setSegmentOptions(segmentsRes.data || [])
      }
    )
  }, [segment?.site_id])

  // Debounced search for contacts to add
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    const timeout = setTimeout(async () => {
      setSearching(true)
      const res = await searchContactsForSegment(segmentId, searchQuery)
      if (res.data) setSearchResults(res.data)
      setSearching(false)
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchQuery, segmentId])

  /** Fetch all segment data in parallel */
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [segmentRes, statsRes, contactsRes, newslettersRes, engagementRes] = await Promise.all([
        getSegmentById(segmentId),
        getSegmentStats(segmentId),
        getSegmentContacts(segmentId, 1, 20),
        getSegmentNewsletters(segmentId),
        getSegmentEngagementOverTime(segmentId)
      ])

      if (segmentRes.error || !segmentRes.data) {
        setError(segmentRes.error || "Segment not found")
        setLoading(false)
        return
      }

      setSegment(segmentRes.data)
      setStats(statsRes.data)
      setContacts(contactsRes.data || [])
      setContactsTotal(contactsRes.total)
      setNewsletters(newslettersRes.data || [])
      setEngagement(engagementRes.data || [])

      // Populate edit form
      setEditForm({
        name: segmentRes.data.name,
        description: segmentRes.data.description,
        segmentType: segmentRes.data.segment_type
      })
      setDynamicConditions(mapDynamicRuleToForm(segmentRes.data.dynamic_rule))
    } catch {
      setError("Failed to load segment data")
    } finally {
      setLoading(false)
    }
  }, [segmentId])

  useEffect(() => {
    if (segmentId) loadData()
  }, [segmentId, loadData])

  /** Load more contacts (pagination) */
  async function loadMoreContacts() {
    setLoadingMore(true)
    const nextPage = contactsPage + 1
    const res = await getSegmentContacts(segmentId, nextPage, 20)
    if (res.data) {
      setContacts((prev) => [...prev, ...res.data!])
      setContactsPage(nextPage)
    }
    setLoadingMore(false)
  }

  /** Refresh contacts list and stats after add/remove */
  async function refreshContactsAndStats() {
    const [statsRes, contactsRes] = await Promise.all([
      getSegmentStats(segmentId),
      getSegmentContacts(segmentId, 1, 20)
    ])
    setStats(statsRes.data)
    setContacts(contactsRes.data || [])
    setContactsTotal(contactsRes.total)
    setContactsPage(1)
  }

  /** Save segment name/description edits */
  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!segment) return
    const dynamicRule = buildDynamicRuleFromForm(dynamicConditions)
    if (editForm.segmentType === "dynamic" && !dynamicRule) {
      setError("Dynamic segments need at least one valid condition")
      return
    }
    setSaving(true)

    const { data, error } = await updateSegment(segment.id, {
      name: editForm.name,
      description: editForm.description,
      segmentType: editForm.segmentType,
      dynamicRule: editForm.segmentType === "dynamic" ? dynamicRule : null
    })

    if (data) {
      setSegment(data)
      setEditForm({
        name: data.name,
        description: data.description,
        segmentType: data.segment_type
      })
      setDynamicConditions(mapDynamicRuleToForm(data.dynamic_rule))
      setSettingsOpen(false)
    }
    if (error) setError(error)
    setSaving(false)
  }

  /** Delete segment and redirect back to segments list */
  async function handleDelete() {
    if (!segment || deleting) return
    setDeleting(true)
    const { success, error } = await deleteSegments([segment.id])
    if (success) {
      router.push("/admin/newsletters/segments")
    } else {
      setDeleteError(error || "Failed to delete segment")
      setDeleting(false)
    }
  }

  /** Remove a contact from the segment */
  async function handleRemoveContact(contactId: string) {
    const { error } = await removeContactsFromSegment([contactId], segmentId)
    if (error) {
      setRemoveContactError(error)
      return
    }
    setContactToRemove(null)
    await refreshContactsAndStats()
  }

  /** Add a contact to the segment from search results */
  async function handleAddContact(contactId: string) {
    setAddingContact(contactId)
    const { error } = await addContactsToSegment([contactId], segmentId)
    if (error) {
      setError(error)
      setAddingContact(null)
      return
    }
    // Clear the added contact from results, refresh data
    setSearchResults((prev) => prev.filter((c) => c.id !== contactId))
    setSearchQuery("")
    setAddingContact(null)
    await refreshContactsAndStats()
  }

  // Helper: format date
  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  }

  // Helper: get contact display name from metadata
  function getContactName(metadata: any): string {
    const first = metadata?.first_name || ""
    const last = metadata?.last_name || ""
    return (first + " " + last).trim()
  }

  // Helper: status badge for contacts
  function getStatusBadge(status: string) {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case "cold":
        return <Badge className="bg-yellow-100 text-yellow-800">Cold</Badge>
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

  const invalidDynamicConditions = editForm.segmentType === "dynamic" && !buildDynamicRuleFromForm(dynamicConditions)
  const segmentExclusionOptions = segmentOptions.filter((option) => option.id !== segment?.id)

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            className="mt-2.5"
            items={[
              { label: "Newsletters", href: "/admin/newsletters" },
              { label: "Segments", href: "/admin/newsletters/segments" },
              {
                label: loading ? (
                  <span className="inline-block h-4 w-32 bg-muted rounded animate-pulse align-middle" />
                ) : (
                  segment?.name || "Segment"
                )
              }
            ]}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} disabled={loading}>
                  <Settings className="h-4 w-4 mr-1" />
                  Settings
                </Button>
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

          {/* Loading skeleton */}
          {loading && (
            <CardGroup className="grid">
              <Card>
                <CardContent className="flex items-center">
                  <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-5 w-48 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-32 bg-muted/60 rounded animate-pulse" />
                  </div>
                </CardContent>
              </Card>
              <CardGroup className="grid grid-cols-1 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                    </CardHeader>
                    <CardContent>
                      <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </CardGroup>
            </CardGroup>
          )}

          {/* Error state */}
          {error && !loading && (
            <Card className="text-center">
              <CardContent>
                <p className="text-red-600 mb-4">{error}</p>
                <Link href="/admin/newsletters/segments">
                  <Button variant="outline">Back to Segments</Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Loaded content */}
          {!loading && segment && (
            <CardGroup className="grid">
              {/* Segment Header */}
              <Card>
                <CardContent className="flex items-center">
                  {/* Icon circle */}
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Filter className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="text-lg font-semibold truncate">{segment.name}</h1>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {segment.segment_type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {stats?.totalContacts ?? 0} contacts
                      {segment.description ? ` · ${segment.description}` : ""}
                    </p>
                    {segment.segment_type === "dynamic" && segment.dynamic_rule && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatSegmentDynamicRule(segment.dynamic_rule)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">Created {formatDate(segment.created_at)}</span>
                </CardContent>
              </Card>

              {/* Stat cards */}
              <CardGroup className="grid grid-cols-1 md:grid-cols-3">
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
                    <CardTitle className="text-sm font-medium text-muted-foreground">Unsubscribe Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">{stats?.unsubscribeRate ?? 0}%</p>
                  </CardContent>
                </Card>
              </CardGroup>

              {/* Two-column layout: Newsletters + Sidebar */}
              <CardGroup className="grid grid-cols-1 lg:grid-cols-3">
                {/* Newsletters — left 2/3 */}
                <Card className="lg:col-span-2">
                  <CardHeader className="border-b">
                    <CardTitle className="text-base">Newsletters</CardTitle>
                  </CardHeader>
                  <div className="divide-y">
                    {newsletters.length === 0 ? (
                      <CardSection className="text-center text-muted-foreground text-sm">
                        No newsletters sent to this segment yet.
                      </CardSection>
                    ) : (
                      newsletters.map((nl) => (
                        <CardSection key={nl.id}>
                          <p className="text-sm font-medium truncate">{nl.subject || nl.name}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {nl.status}
                            </Badge>
                            {nl.sentAt && <span>{formatDate(nl.sentAt)}</span>}
                            <span>·</span>
                            <span>{nl.totalSent} sent</span>
                            <span>·</span>
                            <span>
                              {nl.totalOpened} opened (
                              {nl.totalSent > 0 ? Math.round((nl.totalOpened / nl.totalSent) * 100) : 0}
                              %)
                            </span>
                            <span>·</span>
                            <span>
                              {nl.totalClicked} clicked (
                              {nl.totalSent > 0 ? Math.round((nl.totalClicked / nl.totalSent) * 100) : 0}
                              %)
                            </span>
                          </div>
                        </CardSection>
                      ))
                    )}
                  </div>
                </Card>

                {/* Right sidebar */}
                <div>
                  {/* Contacts list */}
                  <Card>
                    <CardHeader className="border-b flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-base">Contacts ({contactsTotal})</CardTitle>
                      {segment.segment_type === "static" ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-3" align="end">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by email..."
                                className="pl-9 h-8 text-sm"
                                autoFocus
                              />
                            </div>
                            <div className="mt-2">
                              {searching && <p className="text-xs text-muted-foreground py-2">Searching...</p>}
                              {searchResults.length > 0 && (
                                <div className="divide-y max-h-48 overflow-y-auto">
                                  {searchResults.map((result) => (
                                    <div key={result.id} className="py-2 flex items-center gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm truncate">{result.email}</p>
                                        {getContactName(result.metadata) && (
                                          <p className="text-xs text-muted-foreground truncate">
                                            {getContactName(result.metadata)}
                                          </p>
                                        )}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs shrink-0"
                                        onClick={() => handleAddContact(result.id)}
                                        disabled={addingContact === result.id}
                                      >
                                        <Plus className="h-3.5 w-3.5 mr-1" />
                                        {addingContact === result.id ? "..." : "Add"}
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                                <p className="text-xs text-muted-foreground py-2">No contacts found</p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <CardDescription>Updates automatically</CardDescription>
                      )}
                    </CardHeader>
                    <div className="divide-y">
                      {contacts.length === 0 ? (
                        <CardSection className="text-center text-muted-foreground text-sm">
                          No contacts in this segment yet.
                        </CardSection>
                      ) : (
                        contacts.map((contact) => (
                          <CardSection key={contact.id} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{contact.email}</p>
                              {getContactName(contact.metadata) && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {getContactName(contact.metadata)}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {getStatusBadge(contact.status)}
                              {segment.segment_type === "static" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                                  onClick={() => {
                                    setRemoveContactError(null)
                                    setContactToRemove({ id: contact.id, email: contact.email })
                                  }}
                                  title="Remove from segment"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </CardSection>
                        ))
                      )}
                    </div>
                    {/* Load more button */}
                    {contacts.length < contactsTotal && (
                      <CardSection className="border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={loadMoreContacts}
                          disabled={loadingMore}
                          className="w-full"
                        >
                          {loadingMore ? "Loading..." : `Load more (${contactsTotal - contacts.length} remaining)`}
                        </Button>
                      </CardSection>
                    )}
                  </Card>
                </div>
              </CardGroup>

              {/* Engagement Over Time chart — only if 3+ data points */}
              {engagement.length >= 3 && (
                <Card>
                  <CardHeader className="border-b">
                    <CardTitle className="text-base">Engagement Over Time</CardTitle>
                  </CardHeader>
                  <CardSection>
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
                  </CardSection>
                </Card>
              )}
            </CardGroup>
          )}
        </div>
      </AdminLayout>

      {/* Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <form id="segment-settings-form" onSubmit={handleSave} className="contents">
          <DashboardModalContent
            title="Segment Settings"
            description="Update the segment name, description, and membership rules."
            footer={
              <>
                <Button variant="outline" type="button" onClick={() => setSettingsOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button form="segment-settings-form" type="submit" disabled={saving || !editForm.name.trim() || invalidDynamicConditions}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </>
            }
          >
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Segment details</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="segment-name">Name</FieldLabel>
                    <Input
                      id="segment-name"
                      value={editForm.name}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Segment name"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="segment-description">Description</FieldLabel>
                    <Textarea
                      id="segment-description"
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          description: e.target.value
                        }))
                      }
                      placeholder="Segment description"
                      className="resize-none"
                      rows={3}
                    />
                  </Field>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Membership type</DashboardModalCardTitle>
                  <CardDescription>Choose how contacts are added to this segment.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid w-fit gap-x-6 gap-y-3 sm:grid-cols-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        className="mt-0.5"
                        checked={editForm.segmentType === "static"}
                        onCheckedChange={(checked) => {
                          if (checked !== true) return
                          setEditForm((prev) => ({
                            ...prev,
                            segmentType: "static"
                          }))
                          setDynamicConditions([])
                        }}
                      />
                      <div className="space-y-1 pt-0.5">
                        <span className="block text-sm font-medium leading-none">Static</span>
                        <p className="text-xs text-muted-foreground">Manual segment membership.</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        className="mt-0.5"
                        checked={editForm.segmentType === "dynamic"}
                        onCheckedChange={(checked) => {
                          if (checked !== true) return
                          setEditForm((prev) => ({
                            ...prev,
                            segmentType: "dynamic"
                          }))
                        }}
                      />
                      <div className="space-y-1 pt-0.5">
                        <span className="block text-sm font-medium leading-none">Dynamic</span>
                        <p className="text-xs text-muted-foreground">Membership updates from conditions.</p>
                      </div>
                    </label>
                  </div>
                  {editForm.segmentType === "dynamic" && (
                    <SegmentDynamicConditionEditor
                      availableTags={availableTags}
                      conditions={dynamicConditions}
                      onChange={setDynamicConditions}
                      segmentOptions={segmentExclusionOptions}
                    />
                  )}
                  {segment?.segment_type !== editForm.segmentType && (
                    <p className="text-xs text-muted-foreground">
                      {editForm.segmentType === "dynamic"
                        ? "Switching to dynamic replaces the current members with contacts matching this rule."
                        : "Switching to static freezes the current members as a manual list."}
                    </p>
                  )}
                </CardContent>
              </Card>
            </CardGroup>
          </DashboardModalContent>
        </form>
      </Dialog>
      <ConfirmDestructive
        action="delete-segment"
        open={deleteConfirmOpen}
        title={`Delete “${segment?.name ?? "segment"}”?`}
        disabled={deleting}
        error={deleteError}
        impactRequest={segment ? { ids: [segment.id], siteId: segment.site_id, target: "segment" } : undefined}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeleteError(null)
        }}
        onConfirm={handleDelete}
      />
      <ConfirmDestructive
        action="remove-segment-contact"
        open={contactToRemove !== null}
        title={`Remove “${contactToRemove?.email ?? "contact"}” from segment?`}
        error={removeContactError}
        onCancel={() => {
          setContactToRemove(null)
          setRemoveContactError(null)
        }}
        onConfirm={() => contactToRemove ? handleRemoveContact(contactToRemove.id) : undefined}
      />
    </>
  )
}
