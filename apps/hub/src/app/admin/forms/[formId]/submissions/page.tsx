"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AlertCircle, ChevronRight, ClipboardList } from "lucide-react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { DashboardModalCardTitle, DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import {
  AdminListFooter,
  AdminListSkeleton,
  AdminTableShell,
  formatRelativeDate,
} from "@/components/admin/layout/list"
import { TableRightActions, TableRightActionsSearch } from "@/components/admin/layout/content/table-right-actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getGuidedFormById,
  getGuidedFormSubmissions,
  type GuidedForm,
  type GuidedFormSubmission,
} from "@/lib/actions/guided-forms/guided-form-actions"

function formatAnswerValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (value === null || value === undefined || value === "") return "No answer"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function getAnswerRows(form: GuidedForm | null, submission: GuidedFormSubmission | null) {
  if (!submission) return []

  const labels = new Map(
    (form?.draft_steps ?? [])
      .flatMap((step) => step.fields)
      .map((field) => [field.id, field.label])
  )

  return Object.entries(submission.answers).map(([fieldId, value]) => ({
    fieldId,
    label: labels.get(fieldId) || fieldId.replace(/_/g, " "),
    value: formatAnswerValue(value),
  }))
}

export default function GuidedFormSubmissionsPage() {
  const params = useParams()
  const formId = params.formId as string
  const [form, setForm] = useState<GuidedForm | null>(null)
  const [submissions, setSubmissions] = useState<GuidedFormSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selectedSubmission, setSelectedSubmission] = useState<GuidedFormSubmission | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")

    Promise.all([
      getGuidedFormById(formId),
      getGuidedFormSubmissions(formId, { pageSize: 100 }),
    ]).then(([formResult, submissionResult]) => {
      if (cancelled) return
      setLoading(false)

      if (formResult.error || !formResult.data) {
        setError(formResult.error || "Failed to load form")
        setForm(null)
        setSubmissions([])
        return
      }

      if (submissionResult.error) {
        setError(submissionResult.error)
        setForm(formResult.data)
        setSubmissions([])
        return
      }

      setForm(formResult.data)
      setSubmissions(submissionResult.data ?? [])
    })

    return () => {
      cancelled = true
    }
  }, [formId])

  const filteredSubmissions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return submissions

    return submissions.filter((submission) => (
      (submission.contact_email || "").toLowerCase().includes(query) ||
      (submission.matched_outcome_id || "").toLowerCase().includes(query) ||
      JSON.stringify(submission.answers).toLowerCase().includes(query)
    ))
  }, [searchQuery, submissions])

  const total = filteredSubmissions.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const visibleSubmissions = filteredSubmissions.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize)
  const selectedAnswerRows = getAnswerRows(form, selectedSubmission)

  const title = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Link href="/admin/forms" className="text-muted-foreground hover:text-foreground">
        Forms
      </Link>
      <ChevronRight className="size-3 text-muted-foreground" />
      <span className="truncate">{form?.name || "Submissions"}</span>
    </span>
  )

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <DashboardSubheader items={[{ label: "Forms", href: "/admin/forms" }, { label: form?.name || "Submissions" }]} />

        <AdminTableShell
          title={title}
          icon={<ClipboardList className="text-muted-foreground" />}
          count={total}
          status={error ? { tone: "error", text: error } : null}
          controls={
            <TableRightActions>
              <TableRightActionsSearch
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Search submissions"
              />
            </TableRightActions>
          }
          footer={!loading ? (
            <AdminListFooter
              currentPage={safeCurrentPage}
              pageSize={pageSize}
              total={total}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          ) : null}
        >
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead column="main">Email</TableHead>
                  <TableHead column="meta">Outcome</TableHead>
                  <TableHead column="content">Response</TableHead>
                  <TableHead column="meta">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <AdminListSkeleton columns={4} rowCount={5} actionCount={0} showCheckbox={false} showThumbnail={false} />
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center">
                      <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
                      <h3 className="mt-4 text-lg font-semibold">Error Loading Submissions</h3>
                      <p className="text-muted-foreground">{error}</p>
                    </TableCell>
                  </TableRow>
                ) : visibleSubmissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center">
                      <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
                      <h3 className="mt-4 text-lg font-semibold">No submissions found</h3>
                      <p className="mt-2 text-muted-foreground">Submissions for this form will appear here.</p>
                    </TableCell>
                  </TableRow>
                ) : visibleSubmissions.map((submission) => {
                  const answerRows = getAnswerRows(form, submission)
                  return (
                  <TableRow key={submission.id}>
                    <TableCell column="main">{submission.contact_email || "No email"}</TableCell>
                    <TableCell column="meta">{submission.matched_outcome_id || "None"}</TableCell>
                    <TableCell column="content" className="max-w-[520px]">
                      <button
                        type="button"
                        className="flex max-w-full min-w-0 items-center gap-1.5 overflow-hidden text-left hover:opacity-80"
                        onClick={() => setSelectedSubmission(submission)}
                      >
                        {answerRows.slice(0, 2).map((answer) => (
                          <Badge key={answer.fieldId} variant="secondary" className="min-w-0 max-w-[220px] shrink truncate">
                            {answer.label}: {answer.value}
                          </Badge>
                        ))}
                        {answerRows.length > 2 ? (
                          <Badge variant="outline" className="shrink-0">+{answerRows.length - 2} more</Badge>
                        ) : null}
                        {answerRows.length === 0 ? (
                          <span className="text-sm text-muted-foreground">No answers</span>
                        ) : null}
                      </button>
                    </TableCell>
                    <TableCell column="mutedMeta">{formatRelativeDate(submission.created_at)}</TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </AdminTableShell>

        <Dialog open={selectedSubmission !== null} onOpenChange={(open) => !open && setSelectedSubmission(null)}>
          <DashboardModalContent
            title="Submission details"
            description={selectedSubmission ? `${selectedSubmission.contact_email || "No email"} - ${formatRelativeDate(selectedSubmission.created_at)}` : undefined}
            className="max-w-[820px]"
          >
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Response</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  {selectedAnswerRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No answers were submitted.</p>
                  ) : (
                    <div className="grid gap-3">
                      {selectedAnswerRows.map((answer) => (
                        <div key={answer.fieldId} className="grid gap-1">
                          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{answer.label}</div>
                          <div className="whitespace-pre-wrap break-words text-base">{answer.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {selectedSubmission ? (
                <Card>
                  <CardHeader>
                    <DashboardModalCardTitle>Submission info</DashboardModalCardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <div className="text-muted-foreground">Email</div>
                        <div className="font-medium">{selectedSubmission.contact_email || "No email"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Outcome</div>
                        <div className="font-medium">{selectedSubmission.matched_outcome_id || "None"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Submitted</div>
                        <div className="font-medium">{formatRelativeDate(selectedSubmission.created_at)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </CardGroup>
          </DashboardModalContent>
        </Dialog>
      </AdminLayout>
    </>
  )
}
