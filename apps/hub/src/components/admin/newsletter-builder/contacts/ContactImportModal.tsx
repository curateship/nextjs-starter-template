"use client"

import { useState, type ChangeEvent, type RefObject } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { bulkImportContacts } from "@/lib/actions/newsletters/contact-actions"

type ContactImportModalProps = {
  fileInputRef: RefObject<HTMLInputElement | null>
  onError: (message: string) => void
  onImported: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  siteId?: string | null
}

const CONTACT_IMPORT_FIELDS = [
  { value: "email", label: "Email" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "tags", label: "Tags" },
  { value: "created_at", label: "Created At" },
  { value: "last_engaged_at", label: "Last Engaged" },
]

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

function parseCSVRaw(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  const headers = parseCSVLine(lines[0]).map((header) => header.trim().replace(/^"|"$/g, ""))
  const rows: string[][] = []
  for (let index = 1; index < lines.length; index += 1) {
    const cols = parseCSVLine(lines[index]).map((col) => col.trim().replace(/^"|"$/g, ""))
    if (cols.some((col) => col)) rows.push(cols)
  }

  return { headers, rows }
}

function getAutoColumnMap(headers: string[]) {
  const autoMap: Record<string, string> = {}
  const used = new Set<string>()

  for (const header of headers) {
    const lower = header.toLowerCase().trim()
    let match = ""

    if (!used.has("email") && (lower === "email" || lower === "email address" || lower === "email_address" || lower === "customer email")) match = "email"
    else if (!used.has("first_name") && (lower === "first_name" || lower === "first name" || lower === "firstname" || lower === "first")) match = "first_name"
    else if (!used.has("last_name") && (lower === "last_name" || lower === "last name" || lower === "lastname" || lower === "last")) match = "last_name"
    else if (!used.has("tags") && (lower === "tags" || lower === "tag")) match = "tags"
    else if (!used.has("created_at") && (lower === "created_at" || lower === "created at" || lower === "date added" || lower === "created" || lower === "date")) match = "created_at"
    else if (!used.has("last_engaged_at") && (lower === "last_engaged_at" || lower === "last engaged" || lower === "last engaged at" || lower === "last active" || lower === "last_active" || lower === "last open" || lower === "last_open")) match = "last_engaged_at"

    autoMap[header] = match
    if (match) used.add(match)
  }

  return autoMap
}

export function ContactImportModal({
  fileInputRef,
  onError,
  onImported,
  onOpenChange,
  open,
  siteId,
}: ContactImportModalProps) {
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)

  const closeImportModal = () => {
    onOpenChange(false)
    setCsvHeaders([])
    setCsvRows([])
    setColumnMap({})
    setImportResult(null)
  }

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (readerEvent) => {
      const text = readerEvent.target?.result as string
      const { headers, rows } = parseCSVRaw(text)
      setCsvHeaders(headers)
      setCsvRows(rows)
      setColumnMap(getAutoColumnMap(headers))
      setImportResult(null)
      onOpenChange(true)
    }
    reader.readAsText(file)
    event.target.value = ""
  }

  function getMappedContacts(): { email: string; first_name?: string; last_name?: string; tags?: string[]; created_at?: string; last_engaged_at?: string }[] {
    const fieldToIdx: Record<string, number> = {}
    for (const [csvHeader, ourField] of Object.entries(columnMap)) {
      if (ourField) {
        const idx = csvHeaders.indexOf(csvHeader)
        if (idx >= 0) fieldToIdx[ourField] = idx
      }
    }

    if (fieldToIdx.email === undefined) return []

    const results: { email: string; first_name?: string; last_name?: string; tags?: string[]; created_at?: string; last_engaged_at?: string }[] = []
    for (const cols of csvRows) {
      const email = cols[fieldToIdx.email]
      if (!email) continue
      results.push({
        email,
        first_name: fieldToIdx.first_name !== undefined ? cols[fieldToIdx.first_name] || undefined : undefined,
        last_name: fieldToIdx.last_name !== undefined ? cols[fieldToIdx.last_name] || undefined : undefined,
        tags: fieldToIdx.tags !== undefined && cols[fieldToIdx.tags] ? cols[fieldToIdx.tags].split(";").map((tag) => tag.trim()).filter(Boolean) : undefined,
        created_at: fieldToIdx.created_at !== undefined ? cols[fieldToIdx.created_at] || undefined : undefined,
        last_engaged_at: fieldToIdx.last_engaged_at !== undefined ? cols[fieldToIdx.last_engaged_at] || undefined : undefined,
      })
    }
    return results
  }

  const hasEmailMapped = Object.values(columnMap).includes("email")

  const handleImport = async () => {
    if (!siteId) return
    const contacts = getMappedContacts()
    if (!contacts.length) return
    setImporting(true)

    try {
      const chunkSize = 2000
      let totalImported = 0
      let totalSkipped = 0

      for (let index = 0; index < contacts.length; index += chunkSize) {
        const chunk = contacts.slice(index, index + chunkSize)
        const result = await bulkImportContacts({ siteId, contacts: chunk })

        if (result.error) {
          onError(result.error)
          return
        }

        totalImported += result.imported
        totalSkipped += result.skipped
      }

      setImportResult({ imported: totalImported, skipped: totalSkipped })
      onImported()
    } catch {
      onError("Import failed")
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeImportModal() }}>
        <DashboardModalContent
          title={importResult ? "Import Complete" : "Import Contacts"}
          description="Map CSV columns to contact fields before importing."
        >
          <CardGroup className="grid">
            <Card>
              <CardContent className="p-4">
            {importResult ? (
              <div className="text-center space-y-4">
                <div className="p-4 bg-green-50 text-green-800 rounded-lg">
                  <p className="font-medium">Import complete</p>
                  <p className="text-sm">{importResult.imported} contacts imported, {importResult.skipped} skipped</p>
                </div>
                <Button onClick={closeImportModal}>Done</Button>
              </div>
            ) : csvHeaders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center">No valid rows found in CSV.</p>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-xl font-semibold">
                    We found {csvRows.length.toLocaleString()} rows of contacts!
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">Map your CSV columns to contact fields</p>
                </div>

                <div className="grid grid-cols-[1fr_32px_1fr] gap-2 mb-3 px-1">
                  <p className="text-sm font-medium text-muted-foreground">CSV data sample</p>
                  <div />
                  <p className="text-sm font-medium text-muted-foreground">Contact field</p>
                </div>

                <div className="space-y-3">
                  {csvHeaders.map((header) => {
                    const colIdx = csvHeaders.indexOf(header)
                    const sample = csvRows.find((row) => row[colIdx]?.trim())?.[colIdx] || ""

                    return (
                      <div key={header}>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">{header}</p>
                        <div className="grid grid-cols-[1fr_32px_1fr] gap-2 items-center">
                          <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center">
                            <span className="text-sm truncate">{sample || "-"}</span>
                          </div>
                          <div className="flex justify-center">
                            <span className="text-muted-foreground">-&gt;</span>
                          </div>
                          <select
                            value={columnMap[header] || ""}
                            onChange={(event) => {
                              const newVal = event.target.value
                              setColumnMap((prev) => {
                                const next = { ...prev }
                                if (newVal) {
                                  for (const key of Object.keys(next)) {
                                    if (next[key] === newVal && key !== header) next[key] = ""
                                  }
                                }
                                next[header] = newVal
                                return next
                              })
                            }}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm w-full"
                          >
                            <option value="">Skip</option>
                            {CONTACT_IMPORT_FIELDS.map((field) => (
                              <option key={field.value} value={field.value}>{field.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="grid grid-cols-[1fr_32px_1fr] gap-2 mt-3 px-1">
                  <p className="text-xs text-muted-foreground">Check that your CSV data on the left</p>
                  <div />
                  <p className="text-xs text-muted-foreground">Matches the contact field on the right</p>
                </div>

                {!hasEmailMapped && (
                  <p className="text-sm text-red-600 mt-4 text-center">Please map at least one column to Email</p>
                )}

                <div className="flex items-center justify-between mt-6 pt-4">
                  <Button variant="ghost" onClick={closeImportModal}>
                    Back
                  </Button>
                  <Button onClick={handleImport} disabled={importing || !hasEmailMapped}>
                    {importing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Importing...
                      </>
                    ) : (
                      "Continue"
                    )}
                  </Button>
                </div>
              </>
            )}
              </CardContent>
            </Card>
          </CardGroup>
        </DashboardModalContent>
      </Dialog>
    </>
  )
}
