alter table email_automation_enrollments
  add column if not exists ended_at timestamptz;

update email_automation_enrollments
set ended_at = coalesce(completed_at, goal_met_at, last_step_sent_at, enrolled_at)
where status <> 'active'
  and ended_at is null;

update email_automation_steps
set node_config = coalesce(node_config, '{}'::jsonb) - 'checkpoint_action' - 'keep_active_when_no_next_node'
where node_type = 'end_rules'
  and (
    node_config->>'checkpoint_action' = 'pause'
    or node_config ? 'keep_active_when_no_next_node'
  );

create index if not exists idx_newsletter_deliveries_type_sent
  on newsletter_deliveries(source_type, sent_at);

create index if not exists idx_newsletter_deliveries_source_contact
  on newsletter_deliveries(source_type, source_id, contact_id);
