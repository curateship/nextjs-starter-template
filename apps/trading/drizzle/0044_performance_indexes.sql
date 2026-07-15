drop index if exists ix_sessions_token_hash;

create index if not exists ix_notifications_recipient_unread
  on notifications (recipient_user_id)
  where read_at is null;

create index if not exists ix_scanner_alerts_unread_created
  on scanner_alerts (created_at desc)
  where read_at is null;

create index if not exists ix_paper_orders_actionable
  on paper_orders (status)
  where status in ('pending', 'cancelling');

create index if not exists ix_worker_heartbeats_kind_seen
  on worker_heartbeats ((meta->>'workerKind'), last_seen_at desc);
