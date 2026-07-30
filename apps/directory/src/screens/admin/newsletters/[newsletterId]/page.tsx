"use client"

import { use, useState } from "react"
import { useRouter } from "@/lib/navigation-client"
import Pause from "lucide-react/dist/esm/icons/pause.js"
import Play from "lucide-react/dist/esm/icons/play.js"

import { Badge } from "@/components/ui/badge"
import { NewsletterEditorShell } from "@/components/admin/newsletter-builder/layout/NewsletterEditorShell"
import { NewsletterSettingsModal } from "@/components/admin/newsletter-builder/layout/NewsletterSettingsModal"
import { PublishNewsletterModal } from "@/components/admin/newsletter-builder/layout/PublishNewsletterModal"
import { useNewsletterBuilder } from "@/components/admin/newsletter-builder/config/useNewsletterBuilder"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { pauseNewsletter, resumeNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { formatNewsletterSendWindows, isWithinNewsletterSendWindow } from "@/lib/actions/newsletters/send-windows"

interface PageProps {
  params: Promise<{ newsletterId: string }>
}

function getDripStatusLabel(newsletter: { status: string; metadata?: Record<string, any> }) {
  const dripConfig = newsletter.metadata?.drip_config

  if (newsletter.status === "paused") return "Paused"
  if (!isWithinNewsletterSendWindow(dripConfig)) return `Waiting for ${formatNewsletterSendWindows(dripConfig, "send")}`

  if (typeof dripConfig?.next_batch_at === "string") {
    const nextBatchAt = new Date(dripConfig.next_batch_at)
    if (nextBatchAt > new Date()) {
      return `Next batch: ${nextBatchAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    }
    return "Waiting for cron"
  }

  return "Drip sending"
}

function getDripRowChips(newsletter: { total_sent: number; total_recipients: number; metadata?: Record<string, any> }) {
  const dripConfig = newsletter.metadata?.drip_config
  const batchesSent = dripConfig?.batches_sent || 0
  const totalBounced = dripConfig?.total_bounced || 0
  const batchLabel = batchesSent === 1 ? "batch" : "batches"

  return [
    {
      key: "sent",
      label: `${newsletter.total_sent} of ${newsletter.total_recipients} sent`,
      className: "bg-muted/40 text-muted-foreground",
    },
    {
      key: "batches",
      label: `${batchesSent} ${batchLabel}`,
      className: "bg-muted/40 text-muted-foreground",
    },
    {
      key: "bounced",
      label: `${totalBounced} bounced`,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    },
  ]
}

export default function NewsletterBuilderPage({ params }: PageProps) {
  const { newsletterId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const builder = useNewsletterBuilder({ newsletterId })
  const newsletter = builder.newsletter

  const dripNotice = newsletter
    && (newsletter.status === "sending" || newsletter.status === "paused")
    && newsletter.metadata?.drip_config?.enabled
      ? (
        <div className={`flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden border-b px-4 py-2.5 text-sm ${newsletter.status === "paused" ? "border-orange-200 bg-orange-50" : "border-blue-200 bg-blue-50"}`}>
          <button
            type="button"
            className={`inline-flex h-6 shrink-0 items-center gap-1 rounded border px-2 text-xs font-medium transition-colors ${newsletter.status === "sending" ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-400 dark:hover:bg-orange-900/40" : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/40"}`}
            onClick={async () => {
              if (newsletter.status === "sending") {
                await pauseNewsletter({ data: { newsletterId: newsletter.id } })
              } else {
                await resumeNewsletter({ data: { newsletterId: newsletter.id } })
              }
              await builder.reloadNewsletter()
            }}
          >
            {newsletter.status === "sending" ? (
              <><Pause className="h-3 w-3" /> Pause</>
            ) : (
              <><Play className="h-3 w-3" /> Resume</>
            )}
          </button>
          <Badge variant="outline" className="h-6 shrink-0 bg-background px-2 text-xs font-medium">
            {getDripStatusLabel(newsletter)}
          </Badge>
          {getDripRowChips(newsletter).map((chip) => (
            <Badge key={chip.key} variant="outline" className={`h-6 shrink-0 px-2 text-xs font-normal ${chip.className}`}>
              {chip.label}
            </Badge>
          ))}
        </div>
      )
      : null

  return (
    <>
      <NewsletterEditorShell
        loading={builder.loading}
        loadingActionCount={4}
        loadingContentRows={5}
        loadingShowHeader
        error={builder.error}
        showError={Boolean(builder.error && !newsletter)}
        errorBackLabel="Back to Newsletters"
        onErrorBack={() => router.push("/admin/newsletters")}
        blocks={builder.blocks}
        selectedBlock={builder.selectedBlock}
        onSelectBlock={builder.setSelectedBlock}
        onDeleteBlock={builder.handleDeleteBlock}
        onReorderBlocks={builder.handleReorderBlocks}
        onAddBlocks={builder.handleAddBlocks}
        updateBlockContent={builder.updateBlockContent}
        onSaveSelectedBlock={builder.saveSelectedBlockContent}
        siteId={currentSite?.id || ""}
        subject={builder.subject}
        onSubjectChange={builder.setSubject}
        emailWidth={newsletter?.metadata?.maxWidth || 600}
        saveStatus={builder.saveStatus}
        isSaving={builder.isSaving}
        onSave={builder.handleSave}
        topNotice={dripNotice}
        onPublish={newsletter && newsletter.status !== "sent" && newsletter.status !== "sending" && newsletter.status !== "paused"
          ? async () => {
              await builder.handleSave()
              setPublishModalOpen(true)
            }
          : undefined}
        settingsDisabled={!newsletter}
        renderSettingsModal={(show, setShow) => (
          <NewsletterSettingsModal
            open={show}
            onOpenChange={setShow}
            newsletter={newsletter}
            siteId={currentSite?.id || ""}
            onSuccess={() => {
              builder.reloadNewsletter()
              setShow(false)
            }}
          />
        )}
      />

      <PublishNewsletterModal
        open={publishModalOpen}
        onOpenChange={setPublishModalOpen}
        newsletter={newsletter}
        siteId={currentSite?.id || ""}
        onSuccess={() => {
          builder.reloadNewsletter()
          setPublishModalOpen(false)
        }}
      />
    </>
  )
}
