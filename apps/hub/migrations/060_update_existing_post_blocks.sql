-- Update existing posts.content_blocks that might have the old 'text' field structure
-- to use the new 'title' and 'body' structure

UPDATE public.posts
SET content_blocks = (
  SELECT jsonb_object_agg(
    key,
    CASE 
      WHEN value->>'type' = 'rich-text' AND value->'content'->>'text' IS NOT NULL THEN
        jsonb_set(
          jsonb_set(
            jsonb_set(
              value,
              '{content,body}',
              COALESCE(value->'content'->'text', '""'::jsonb)
            ),
            '{content,title}',
            '""'::jsonb
          ),
          '{content,format}',
          '"html"'::jsonb
        ) #- '{content,text}'
      ELSE
        value
    END
  )
  FROM jsonb_each(content_blocks)
)
WHERE content_blocks IS NOT NULL 
AND EXISTS (
  SELECT 1 
  FROM jsonb_each(content_blocks) AS blocks(key, value)
  WHERE value->>'type' = 'rich-text' 
  AND value->'content'->>'text' IS NOT NULL
);