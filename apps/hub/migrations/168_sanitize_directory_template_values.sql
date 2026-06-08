WITH sanitized_templates AS (
  SELECT
    dt.id,
    COALESCE(
      jsonb_object_agg(entry.key, sanitized.block) FILTER (WHERE sanitized.block IS NOT NULL),
      '{}'::jsonb
    ) AS content_blocks
  FROM directory_templates dt
  LEFT JOIN LATERAL jsonb_each(COALESCE(dt.content_blocks, '{}'::jsonb)) AS entry(key, value) ON true
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN left(entry.key, 1) = '_' THEN entry.value
        WHEN entry.value->>'type' = 'directory-core' THEN jsonb_strip_nulls(jsonb_build_object(
          'id', COALESCE(entry.value->>'id', entry.key),
          'type', 'directory-core',
          'title', NULLIF(entry.value->>'title', ''),
          'display_order', entry.value->'display_order',
          'content', jsonb_strip_nulls(jsonb_build_object(
            'layoutColumn', entry.value#>'{content,layoutColumn}',
            'sticky', entry.value#>'{content,sticky}',
            'claimEnabled', entry.value#>'{content,claimEnabled}',
            'claimButtonText', entry.value#>'{content,claimButtonText}',
            'claimPendingEmailText', entry.value#>'{content,claimPendingEmailText}',
            'claimPendingReviewText', entry.value#>'{content,claimPendingReviewText}',
            'claimApprovedText', entry.value#>'{content,claimApprovedText}',
            'ownerEditPath', entry.value#>'{content,ownerEditPath}',
            'saveIconOpacity', entry.value#>'{content,saveIconOpacity}',
            'visibility', entry.value#>'{content,visibility}'
          ))
        ))
        WHEN entry.value->>'type' = 'directory-custom' THEN jsonb_strip_nulls(jsonb_build_object(
          'id', COALESCE(entry.value->>'id', entry.key),
          'type', 'directory-custom',
          'title', NULLIF(entry.value->>'title', ''),
          'display_order', entry.value->'display_order',
          'content', jsonb_strip_nulls(jsonb_build_object(
            'layoutColumn', entry.value#>'{content,layoutColumn}',
            'visibility', entry.value#>'{content,visibility}',
            'templateId', entry.value#>'{content,templateId}'
          ))
        ))
        WHEN entry.value->>'type' IN ('directory-rich-text', 'directory-content') THEN jsonb_strip_nulls(jsonb_build_object(
          'id', COALESCE(entry.value->>'id', entry.key),
          'type', 'directory-rich-text',
          'title', NULLIF(entry.value->>'title', ''),
          'display_order', entry.value->'display_order',
          'content', jsonb_strip_nulls(jsonb_build_object(
            'layoutColumn', entry.value#>'{content,layoutColumn}',
            'visibility', entry.value#>'{content,visibility}'
          ))
        ))
        WHEN entry.value->>'type' = 'directory-google-map' THEN jsonb_strip_nulls(jsonb_build_object(
          'id', COALESCE(entry.value->>'id', entry.key),
          'type', 'directory-google-map',
          'title', NULLIF(entry.value->>'title', ''),
          'display_order', entry.value->'display_order',
          'content', jsonb_strip_nulls(jsonb_build_object(
            'layoutColumn', entry.value#>'{content,layoutColumn}',
            'visibility', entry.value#>'{content,visibility}',
            'height', entry.value#>'{content,height}'
          ))
        ))
        WHEN entry.value->>'type' = 'directory-opening-hours' THEN jsonb_strip_nulls(jsonb_build_object(
          'id', COALESCE(entry.value->>'id', entry.key),
          'type', 'directory-opening-hours',
          'title', NULLIF(entry.value->>'title', ''),
          'display_order', entry.value->'display_order',
          'content', jsonb_strip_nulls(jsonb_build_object(
            'layoutColumn', entry.value#>'{content,layoutColumn}',
            'visibility', entry.value#>'{content,visibility}'
          ))
        ))
        ELSE NULL
      END AS block
  ) sanitized
  GROUP BY dt.id
)
UPDATE directory_templates dt
SET
  content_blocks = sanitized_templates.content_blocks,
  updated_at = now()
FROM sanitized_templates
WHERE dt.id = sanitized_templates.id;
