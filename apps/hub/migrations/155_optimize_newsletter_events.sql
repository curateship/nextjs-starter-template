CREATE TABLE IF NOT EXISTS newsletter_source_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL,
  source_id UUID NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  opened INTEGER NOT NULL DEFAULT 0,
  clicked INTEGER NOT NULL DEFAULT 0,
  bounced INTEGER NOT NULL DEFAULT 0,
  complained INTEGER NOT NULL DEFAULT 0,
  unsubscribed INTEGER NOT NULL DEFAULT 0,
  duplicate_sends INTEGER NOT NULL DEFAULT 0,
  first_sent_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_source_stats_unique
  ON newsletter_source_stats(site_id, source_type, source_id, step_order);
CREATE INDEX IF NOT EXISTS idx_newsletter_source_stats_site
  ON newsletter_source_stats(site_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_source_stats_source
  ON newsletter_source_stats(source_type, source_id, step_order);

CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES newsletter_contacts(id) ON DELETE SET NULL,
  source_type VARCHAR(20) NOT NULL,
  source_id UUID NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(255) NOT NULL,
  is_duplicate_send BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  first_clicked_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  complained_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  open_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  last_clicked_url TEXT,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_deliveries_provider_msg
  ON newsletter_deliveries(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_site_sent
  ON newsletter_deliveries(site_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_contact_sent
  ON newsletter_deliveries(contact_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_source
  ON newsletter_deliveries(source_type, source_id, step_order);

WITH source_events AS (
  SELECT
    e.*,
    CASE
      WHEN e.metadata->>'step_order' ~ '^[0-9]+$' THEN (e.metadata->>'step_order')::int
      ELSE 0
    END AS raw_step_order
  FROM newsletter_events e
  WHERE e.source_id IS NOT NULL
),
sent_ranked AS (
  SELECT
    e.*,
    ROW_NUMBER() OVER (
      PARTITION BY e.provider_message_id
      ORDER BY e.created_at ASC, e.id ASC
    ) AS provider_row_number
  FROM source_events e
  WHERE e.event_type = 'sent'
    AND e.provider_message_id IS NOT NULL
    AND e.contact_id IS NOT NULL
),
canonical_sends AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (
      PARTITION BY s.site_id, s.source_type, s.source_id, s.raw_step_order, s.contact_id
      ORDER BY s.created_at ASC, s.id ASC
    ) AS contact_send_number
  FROM sent_ranked s
  WHERE s.provider_row_number = 1
),
sent_steps AS (
  SELECT
    provider_message_id,
    contact_id,
    site_id,
    source_type,
    source_id,
    raw_step_order AS step_order,
    MIN(created_at) AS sent_at
  FROM canonical_sends
  GROUP BY provider_message_id, contact_id, site_id, source_type, source_id, raw_step_order
),
normalized_events AS (
  SELECT
    e.site_id,
    e.source_type,
    e.source_id,
    COALESCE(NULLIF(e.raw_step_order, 0), ss.step_order, 0) AS step_order,
    e.contact_id,
    e.provider_message_id,
    e.event_type,
    e.id,
    e.created_at,
    e.metadata
  FROM source_events e
  LEFT JOIN sent_steps ss
    ON ss.provider_message_id = e.provider_message_id
    AND ss.contact_id IS NOT DISTINCT FROM e.contact_id
    AND ss.site_id = e.site_id
),
sent_rollups AS (
  SELECT
    site_id,
    source_type,
    source_id,
    raw_step_order AS step_order,
    COUNT(*) FILTER (WHERE contact_send_number = 1)::int AS sent,
    COUNT(*) FILTER (WHERE contact_send_number > 1)::int AS duplicate_sends,
    MIN(created_at) FILTER (WHERE contact_send_number = 1) AS first_sent_at,
    MAX(created_at) AS last_sent_at,
    MAX(created_at) AS last_sent_event_at
  FROM canonical_sends
  GROUP BY site_id, source_type, source_id, raw_step_order
),
delivered_providers AS (
  SELECT site_id, source_type, source_id, step_order, provider_message_id, MIN(created_at) AS delivered_at
  FROM normalized_events
  WHERE event_type = 'delivered'
    AND provider_message_id IS NOT NULL
  GROUP BY site_id, source_type, source_id, step_order, provider_message_id
  UNION ALL
  SELECT site_id, source_type, source_id, raw_step_order AS step_order, provider_message_id, MIN(created_at) AS delivered_at
  FROM sent_ranked
  WHERE provider_row_number > 1
  GROUP BY site_id, source_type, source_id, raw_step_order, provider_message_id
),
delivered_rollups AS (
  SELECT
    site_id,
    source_type,
    source_id,
    step_order,
    COUNT(DISTINCT provider_message_id)::int AS delivered,
    MAX(delivered_at) AS last_delivered_at
  FROM delivered_providers
  GROUP BY site_id, source_type, source_id, step_order
),
event_rollups AS (
  SELECT
    site_id,
    source_type,
    source_id,
    step_order,
    COUNT(DISTINCT COALESCE(provider_message_id, id::text)) FILTER (WHERE event_type = 'opened')::int AS opened,
    COUNT(DISTINCT COALESCE(provider_message_id, id::text)) FILTER (WHERE event_type = 'clicked')::int AS clicked,
    COUNT(DISTINCT COALESCE(provider_message_id, id::text)) FILTER (WHERE event_type = 'bounced')::int AS bounced,
    COUNT(DISTINCT COALESCE(provider_message_id, id::text)) FILTER (WHERE event_type = 'complained')::int AS complained,
    COUNT(DISTINCT COALESCE(provider_message_id, id::text)) FILTER (WHERE event_type = 'unsubscribed')::int AS unsubscribed,
    MAX(created_at) AS last_event_at
  FROM normalized_events
  WHERE event_type IN ('opened', 'clicked', 'bounced', 'complained', 'unsubscribed')
  GROUP BY site_id, source_type, source_id, step_order
),
source_keys AS (
  SELECT site_id, source_type, source_id, step_order FROM sent_rollups
  UNION
  SELECT site_id, source_type, source_id, step_order FROM delivered_rollups
  UNION
  SELECT site_id, source_type, source_id, step_order FROM event_rollups
)
INSERT INTO newsletter_source_stats (
  site_id,
  source_type,
  source_id,
  step_order,
  sent,
  delivered,
  opened,
  clicked,
  bounced,
  complained,
  unsubscribed,
  duplicate_sends,
  first_sent_at,
  last_sent_at,
  last_event_at,
  updated_at
)
SELECT
  k.site_id,
  k.source_type,
  k.source_id,
  k.step_order,
  COALESCE(s.sent, 0),
  COALESCE(d.delivered, 0),
  COALESCE(e.opened, 0),
  COALESCE(e.clicked, 0),
  COALESCE(e.bounced, 0),
  COALESCE(e.complained, 0),
  COALESCE(e.unsubscribed, 0),
  COALESCE(s.duplicate_sends, 0),
  s.first_sent_at,
  s.last_sent_at,
  GREATEST(
    COALESCE(s.last_sent_event_at, '-infinity'::timestamptz),
    COALESCE(d.last_delivered_at, '-infinity'::timestamptz),
    COALESCE(e.last_event_at, '-infinity'::timestamptz)
  ),
  NOW()
FROM source_keys k
LEFT JOIN sent_rollups s
  ON s.site_id = k.site_id AND s.source_type = k.source_type AND s.source_id = k.source_id AND s.step_order = k.step_order
LEFT JOIN delivered_rollups d
  ON d.site_id = k.site_id AND d.source_type = k.source_type AND d.source_id = k.source_id AND d.step_order = k.step_order
LEFT JOIN event_rollups e
  ON e.site_id = k.site_id AND e.source_type = k.source_type AND e.source_id = k.source_id AND e.step_order = k.step_order
ON CONFLICT (site_id, source_type, source_id, step_order) DO UPDATE SET
  sent = EXCLUDED.sent,
  delivered = EXCLUDED.delivered,
  opened = EXCLUDED.opened,
  clicked = EXCLUDED.clicked,
  bounced = EXCLUDED.bounced,
  complained = EXCLUDED.complained,
  unsubscribed = EXCLUDED.unsubscribed,
  duplicate_sends = EXCLUDED.duplicate_sends,
  first_sent_at = EXCLUDED.first_sent_at,
  last_sent_at = EXCLUDED.last_sent_at,
  last_event_at = EXCLUDED.last_event_at,
  updated_at = NOW();

WITH source_events AS (
  SELECT
    e.*,
    CASE
      WHEN e.metadata->>'step_order' ~ '^[0-9]+$' THEN (e.metadata->>'step_order')::int
      ELSE 0
    END AS raw_step_order
  FROM newsletter_events e
  WHERE e.source_id IS NOT NULL
),
sent_ranked AS (
  SELECT
    e.*,
    ROW_NUMBER() OVER (
      PARTITION BY e.provider_message_id
      ORDER BY e.created_at ASC, e.id ASC
    ) AS provider_row_number
  FROM source_events e
  WHERE e.event_type = 'sent'
    AND e.provider_message_id IS NOT NULL
    AND e.contact_id IS NOT NULL
),
canonical_sends AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (
      PARTITION BY s.site_id, s.source_type, s.source_id, s.raw_step_order, s.contact_id
      ORDER BY s.created_at ASC, s.id ASC
    ) AS contact_send_number
  FROM sent_ranked s
  WHERE s.provider_row_number = 1
),
sent_steps AS (
  SELECT
    provider_message_id,
    contact_id,
    site_id,
    raw_step_order AS step_order
  FROM canonical_sends
),
normalized_events AS (
  SELECT
    e.*,
    COALESCE(NULLIF(e.raw_step_order, 0), ss.step_order, 0) AS step_order
  FROM source_events e
  LEFT JOIN sent_steps ss
    ON ss.provider_message_id = e.provider_message_id
    AND ss.contact_id IS NOT DISTINCT FROM e.contact_id
    AND ss.site_id = e.site_id
),
delivery_events AS (
  SELECT
    cs.id,
    cs.site_id,
    cs.contact_id,
    cs.source_type,
    cs.source_id,
    cs.raw_step_order,
    cs.provider_message_id,
    cs.created_at,
    cs.contact_send_number,
    MIN(ne.created_at) FILTER (WHERE ne.event_type = 'delivered') AS delivered_at,
    MIN(sr.created_at) FILTER (WHERE sr.provider_row_number > 1) AS delivered_from_sent_at,
    MIN(ne.created_at) FILTER (WHERE ne.event_type = 'opened') AS first_opened_at,
    MAX(ne.created_at) FILTER (WHERE ne.event_type = 'opened') AS last_opened_at,
    MIN(ne.created_at) FILTER (WHERE ne.event_type = 'clicked') AS first_clicked_at,
    MAX(ne.created_at) FILTER (WHERE ne.event_type = 'clicked') AS last_clicked_at,
    MIN(ne.created_at) FILTER (WHERE ne.event_type = 'bounced') AS bounced_at,
    MIN(ne.created_at) FILTER (WHERE ne.event_type = 'complained') AS complained_at,
    MIN(ne.created_at) FILTER (WHERE ne.event_type = 'unsubscribed') AS unsubscribed_at,
    COUNT(DISTINCT ne.provider_message_id) FILTER (WHERE ne.event_type = 'opened')::int AS open_count,
    COUNT(DISTINCT ne.provider_message_id) FILTER (WHERE ne.event_type = 'clicked')::int AS click_count,
    (ARRAY_AGG(ne.metadata->>'link_url' ORDER BY ne.created_at DESC) FILTER (WHERE ne.event_type = 'clicked' AND ne.metadata->>'link_url' IS NOT NULL))[1] AS last_clicked_url,
    MAX(ne.created_at) AS last_event_at
  FROM canonical_sends cs
  LEFT JOIN normalized_events ne
    ON ne.provider_message_id = cs.provider_message_id
    AND ne.site_id = cs.site_id
    AND ne.event_type <> 'sent'
  LEFT JOIN sent_ranked sr
    ON sr.provider_message_id = cs.provider_message_id
    AND sr.provider_row_number > 1
  WHERE cs.created_at >= NOW() - INTERVAL '60 days'
  GROUP BY cs.id, cs.site_id, cs.contact_id, cs.source_type, cs.source_id, cs.raw_step_order, cs.provider_message_id, cs.created_at, cs.contact_send_number
)
INSERT INTO newsletter_deliveries (
  site_id,
  contact_id,
  source_type,
  source_id,
  step_order,
  provider_message_id,
  is_duplicate_send,
  sent_at,
  delivered_at,
  first_opened_at,
  last_opened_at,
  first_clicked_at,
  last_clicked_at,
  bounced_at,
  complained_at,
  unsubscribed_at,
  open_count,
  click_count,
  last_clicked_url,
  last_event_at,
  updated_at
)
SELECT
  site_id,
  contact_id,
  source_type,
  source_id,
  raw_step_order,
  provider_message_id,
  contact_send_number > 1,
  created_at,
  COALESCE(delivered_at, delivered_from_sent_at),
  first_opened_at,
  last_opened_at,
  first_clicked_at,
  last_clicked_at,
  bounced_at,
  complained_at,
  unsubscribed_at,
  LEAST(open_count, 1),
  LEAST(click_count, 1),
  last_clicked_url,
  GREATEST(
    COALESCE(last_event_at, '-infinity'::timestamptz),
    COALESCE(delivered_from_sent_at, '-infinity'::timestamptz),
    created_at
  ),
  NOW()
FROM delivery_events
ON CONFLICT (provider_message_id) DO NOTHING;

WITH source_events AS (
  SELECT
    e.*,
    CASE
      WHEN e.metadata->>'step_order' ~ '^[0-9]+$' THEN (e.metadata->>'step_order')::int
      ELSE 0
    END AS raw_step_order
  FROM newsletter_events e
  WHERE e.source_id IS NOT NULL
),
sent_ranked AS (
  SELECT
    e.*,
    ROW_NUMBER() OVER (
      PARTITION BY e.provider_message_id
      ORDER BY e.created_at ASC, e.id ASC
    ) AS provider_row_number
  FROM source_events e
  WHERE e.event_type = 'sent'
    AND e.provider_message_id IS NOT NULL
    AND e.contact_id IS NOT NULL
),
canonical_sends AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (
      PARTITION BY s.site_id, s.source_type, s.source_id, s.raw_step_order, s.contact_id
      ORDER BY s.created_at ASC, s.id ASC
    ) AS contact_send_number
  FROM sent_ranked s
  WHERE s.provider_row_number = 1
),
sent_containers AS (
  SELECT
    site_id,
    contact_id,
    source_type,
    source_id,
    raw_step_order AS step_order,
    MAX(created_at) AS sent_at
  FROM canonical_sends
  WHERE contact_send_number = 1
  GROUP BY site_id, contact_id, source_type, source_id, raw_step_order
),
opened_containers AS (
  SELECT
    e.contact_id,
    e.source_type,
    e.source_id,
    COALESCE(NULLIF(e.raw_step_order, 0), cs.raw_step_order, 0) AS step_order,
    MAX(e.created_at) AS opened_at
  FROM source_events e
  LEFT JOIN canonical_sends cs
    ON cs.provider_message_id = e.provider_message_id
    AND cs.contact_id IS NOT DISTINCT FROM e.contact_id
  WHERE e.event_type = 'opened'
    AND e.contact_id IS NOT NULL
  GROUP BY e.contact_id, e.source_type, e.source_id, COALESCE(NULLIF(e.raw_step_order, 0), cs.raw_step_order, 0)
),
clicked_containers AS (
  SELECT
    e.contact_id,
    e.source_type,
    e.source_id,
    COALESCE(NULLIF(e.raw_step_order, 0), cs.raw_step_order, 0) AS step_order,
    MAX(e.created_at) AS clicked_at
  FROM source_events e
  LEFT JOIN canonical_sends cs
    ON cs.provider_message_id = e.provider_message_id
    AND cs.contact_id IS NOT DISTINCT FROM e.contact_id
  WHERE e.event_type = 'clicked'
    AND e.contact_id IS NOT NULL
  GROUP BY e.contact_id, e.source_type, e.source_id, COALESCE(NULLIF(e.raw_step_order, 0), cs.raw_step_order, 0)
),
ranked_activity AS (
  SELECT
    sc.*,
    oc.opened_at,
    cc.clicked_at,
    ROW_NUMBER() OVER (PARTITION BY sc.contact_id ORDER BY sc.sent_at DESC) AS row_number
  FROM sent_containers sc
  LEFT JOIN opened_containers oc
    ON oc.contact_id = sc.contact_id
    AND oc.source_type = sc.source_type
    AND oc.source_id = sc.source_id
    AND oc.step_order = sc.step_order
  LEFT JOIN clicked_containers cc
    ON cc.contact_id = sc.contact_id
    AND cc.source_type = sc.source_type
    AND cc.source_id = sc.source_id
    AND cc.step_order = sc.step_order
),
activity AS (
  SELECT
    contact_id,
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'key',
        CASE
          WHEN source_type = 'automation' THEN source_type || ':' || source_id::text || ':step:' || step_order::text
          ELSE source_type || ':' || source_id::text
        END,
        'source_type', source_type,
        'source_id', source_id::text,
        'step_order', step_order,
        'sent_at', sent_at,
        'opened_at', opened_at,
        'clicked_at', clicked_at
      )
      ORDER BY sent_at DESC
    ) AS entries
  FROM ranked_activity
  WHERE row_number <= 50
  GROUP BY contact_id
)
UPDATE newsletter_contacts c
SET
  metadata = COALESCE(c.metadata, '{}'::jsonb) || JSONB_BUILD_OBJECT('recent_email_activity', activity.entries),
  updated_at = NOW()
FROM activity
WHERE c.id = activity.contact_id;

INSERT INTO cron_jobs (name, endpoint, schedule, enabled)
SELECT 'Newsletter Delivery Cleanup', '/api/cron/newsletter-deliveries-cleanup', '0 * * * *', true
WHERE NOT EXISTS (
  SELECT 1 FROM cron_jobs WHERE endpoint = '/api/cron/newsletter-deliveries-cleanup'
);
