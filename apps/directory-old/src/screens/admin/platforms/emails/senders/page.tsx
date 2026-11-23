"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "@/components/app-link";
import { AdminLayout } from "@/components/admin/layout/admin-layout";
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader";
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader";
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider";
import {
  AdminListFooter,
  AdminListPending,
  AdminSortableHead,
  AdminTableShell,
  useAdminSort,
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
import {
  getSiteIntegration,
  type SiteIntegration,
} from "@/lib/actions/integrations/integration-actions";
import { useResetPageOnListChange } from "@/lib/use-reset-page";
import Mail from "lucide-react/dist/esm/icons/mail.js"

interface SenderRow {
  name: string;
  email: string;
  provider: string;
  status: "Connected";
  updatedAt: string | null;
}

type SenderSortColumn = "sender" | "provider" | "status";

function buildSenderRows(integration: SiteIntegration | null): SenderRow[] {
  const fromEmail = integration?.config?.from_email?.trim();
  if (!fromEmail) {
    return [];
  }

  return [
    {
      name: integration?.config?.from_name?.trim() || "Unnamed Sender",
      email: fromEmail,
      provider: "Resend",
      status: "Connected",
      updatedAt: integration?.updatedAt?.toISOString?.() ?? null,
    },
  ];
}

export default function PlatformSenderEmailsPage() {
  const { currentSite, pageSize } = useSiteSwitcher();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [senders, setSenders] = useState<SenderRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const senderSort = useAdminSort<SenderSortColumn>("sender", "asc");

  const loadPage = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    const resendIntegration = await getSiteIntegration({ data: { siteId: currentSite.id, integrationType: "resend" } });
    const rows = buildSenderRows(resendIntegration);

    setSenders(rows);
    if (rows.length === 0) {
      setMessage("No sender email is configured for this site.");
    }

    setLoading(false);
  }, [currentSite?.id]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSenders = normalizedSearchQuery
    ? senders.filter((sender) => {
        const searchText = [
          sender.name,
          sender.email,
          sender.provider,
          sender.status,
        ]
          .join(" ")
          .toLowerCase();

        return searchText.includes(normalizedSearchQuery);
      })
    : senders;

  const sortedSenders = useMemo(() => {
    return [...filteredSenders].sort((a, b) => {
      if (!senderSort.sortColumn) return 0;

      const dir = senderSort.sortDirection === "asc" ? 1 : -1;
      if (senderSort.sortColumn === "sender")
        return (a.name.localeCompare(b.name) || a.email.localeCompare(b.email)) * dir;
      if (senderSort.sortColumn === "provider") return a.provider.localeCompare(b.provider) * dir;

      return a.status.localeCompare(b.status) * dir;
    });
  }, [filteredSenders, senderSort.sortColumn, senderSort.sortDirection]);

  // Searching or re-sorting from a later page would otherwise land you past
  // the end of the shorter result.
  useResetPageOnListChange(
    setCurrentPage,
    `${currentSite?.id}|${normalizedSearchQuery}|${senderSort.sortColumn}|${senderSort.sortDirection}`
  );

  const pagedSenders = useMemo(
    () => sortedSenders.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, sortedSenders]
  );

  if (!currentSite) {
    return (
      <AdminLayout>
        <div className="p-8 text-sm text-muted-foreground">
          Choose a site to manage emails.
        </div>
      </AdminLayout>
    );
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader items={[{ label: "Email Accounts" }]} />

          {message && (
            <div className="mb-6 rounded-md border px-4 py-3 text-sm">
              {message}
            </div>
          )}

          <AdminTableShell
            title="Email Accounts"
            icon={<Mail className="text-muted-foreground" />}
            count={filteredSenders.length}
            loading={loading}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search email accounts"
                />
              </TableRightActions>
            }
            footer={!loading ? <AdminListFooter currentPage={currentPage} pageSize={pageSize} total={filteredSenders.length} onPageChange={setCurrentPage} /> : null}
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <AdminSortableHead column="main" sort={senderSort} sortKey="sender">Sender</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={senderSort} sortKey="provider">Provider</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={senderSort} sortKey="status">Status</AdminSortableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && filteredSenders.length === 0 ? (
                    <AdminListPending />
                  ) : filteredSenders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-32 text-center text-sm text-muted-foreground"
                      >
                        {normalizedSearchQuery
                          ? "No email accounts found matching your search."
                          : "No email accounts found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedSenders.map((sender) => (
                      <TableRow key={sender.email} className="group">
                        <TableCell column="main">
                          <Link
                            href={`/admin/site-health/email?sender=${encodeURIComponent(sender.email)}`}
                            className="block hover:underline"
                          >
                            <p className="truncate text-sm font-medium sm:text-base" title={sender.name}>{sender.name}</p>
                            <p className="truncate text-xs text-muted-foreground sm:text-sm" title={sender.email}>{sender.email}</p>
                          </Link>
                        </TableCell>
                        <TableCell column="meta">{sender.provider}</TableCell>
                        <TableCell column="meta">
                          <Badge
                            variant={
                              sender.status === "Connected"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {sender.status}
                          </Badge>
                        </TableCell>
                        <TableCell column="meta">
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={`/admin/site-health/email?sender=${encodeURIComponent(sender.email)}`}
                            >
                              View Health
                            </Link>
                          </Button>
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
