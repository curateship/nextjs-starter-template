-- Migration: Rename hotspots to productHotspots in product-hotspot blocks
-- This migration renames the hotspots field to productHotspots for consistency

-- Rename hotspots to productHotspots within product-hotspot blocks
UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    block_key,
    CASE
      WHEN block_key = '_settings' THEN block_value
      WHEN block_key = 'product-hotspot' THEN (
        SELECT jsonb_object_agg(
          CASE
            WHEN key = 'hotspots' THEN 'productHotspots'
            ELSE key
          END,
          value
        )
        FROM jsonb_each(block_value)
      )
      ELSE block_value
    END
  )
  FROM jsonb_each(content_blocks) AS blocks(block_key, block_value)
)
WHERE content_blocks IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_each(content_blocks) AS blocks(block_key, block_value)
    WHERE block_key = 'product-hotspot'
      AND block_value ? 'hotspots'
  );
