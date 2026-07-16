"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/app-link";
import { AdminLayout } from "@/components/admin/layout/admin-layout";
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader";
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader";
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider";
import {
  AdminTableShell,
  AdminTableSummaryFooter,
  AdminListSkeleton,
  formatShortDate,
} from "@/components/admin/layout/list";
import {
  TableRightActions,
  TableRightActionsSearch,
} from "@/components/admin/layout/content/table-right-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSystemEmailDashboardAction } from "@/lib/actions/email/system-email-actions";
import type { SystemEmailListItem } from "@/lib/actions/email/system-email";
import Mail from "lucide-react/dist/esm/icons/mail.js"

interface DashboardData {
  templates: SystemEmailListItem[];
}

export default function PlatformEmailsPage() {
  const { currentSite } = useSiteSwitcher();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadPage = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    const dashboardResult = await getSystemEmailDashboardAction(currentSite.id);

    if (!dashboardResult.success || !dashboardResult.data) {
      setMessage({
        type: "error",
        text: dashboardResult.error || "Failed to load system emails.",
      });
      setDashboard(null);
    } else {
      setDashboard(dashboardResult.data);
    }

    setLoading(false);
  }, [currentSite?.id]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const templates = dashboard?.templates ?? [];
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredTemplates = normalizedSearchQuery
    ? templates.filter((template) => {
        const searchText = [
          template.name,
          template.description,
          template.scope_label,
          template.template_key,
        ]
          .join(" ")
          .toLowerCase();

        return searchText.includes(normalizedSearchQuery);
      })
    : templates;

  if (!currentSite) {
    return (
      <AdminLayout>
        <div className="p-8 text-sm text-muted-foreground">
          Choose a site to manage system emails.
        </div>
      </AdminLayout>
    );
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader items={[{ label: "Email Templates" }]} />

          {message && (
            <div
              className={`mb-6 rounded-md border px-4 py-3 text-sm ${message.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}
            >
              {message.text}
            </div>
          )}

          <AdminTableShell
            title="Email Templates"
            icon={<Mail className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={filteredTemplates.length}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search email templates"
                />
              </TableRightActions>
            }
            footer={!loading ? <AdminTableSummaryFooter count={filteredTemplates.length} label="email templates" /> : null}
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="main">Template</TableHead>
                    <TableHead column="meta">Scope</TableHead>
                    <TableHead column="meta">Updated</TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton
                      columns={4}
                      rowCount={3}
                      showCheckbox={false}
                      showThumbnail={false}
                    />
                  ) : filteredTemplates.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-32 text-center text-sm text-muted-foreground"
                      >
                        {normalizedSearchQuery
                          ? "No email templates match your search."
                          : "No email templates found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTemplates.map((template) => (
                      <TableRow key={template.template_key} className="group">
                        <TableCell column="main">
                          <div className="flex items-center gap-2">
                            {template.editable ? (
                              <Link
                                href={`/admin/platforms/emails/${template.template_key}`}
                                className="truncate text-sm font-medium hover:underline sm:text-base"
                              >
                                {template.name}
                              </Link>
                            ) : (
                              <p className="truncate text-sm font-medium sm:text-base">
                                {template.name}
                              </p>
                            )}
                            {!template.editable && (
                              <Badge variant="secondary">Super Admin</Badge>
                            )}
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
                            {template.description}
                          </p>
                        </TableCell>
                        <TableCell column="meta">
                          {template.scope_label}
                        </TableCell>
                        <TableCell column="mutedMeta">
                          {template.updated_at
                            ? formatShortDate(template.updated_at)
                            : "Default"}
                        </TableCell>
                        <TableCell column="meta">
                          {template.editable ? (
                            <Button asChild variant="outline" size="sm">
                              <Link
                                href={`/admin/platforms/emails/${template.template_key}`}
                              >
                                Edit
                              </Link>
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" disabled>
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>
        </div>
      </AdminLayout>
    </>
  );
}
