-- Create post_blocks table for JSON content
CREATE TABLE IF NOT EXISTS public.post_blocks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  content_blocks jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes for performance
CREATE INDEX idx_post_blocks_post_id ON public.post_blocks(post_id);
CREATE INDEX idx_post_blocks_content_blocks ON public.post_blocks USING GIN (content_blocks);

-- Enable RLS
ALTER TABLE public.post_blocks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Public post blocks are viewable by everyone" ON public.post_blocks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_blocks.post_id
      AND posts.is_published = true
    )
  );

CREATE POLICY "Post blocks are insertable by authenticated users" ON public.post_blocks
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Post blocks are editable by authenticated users" ON public.post_blocks
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Post blocks are deletable by authenticated users" ON public.post_blocks
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Migrate existing post content to post_blocks table
INSERT INTO public.post_blocks (post_id, content_blocks, created_at, updated_at)
SELECT 
  id as post_id,
  jsonb_build_object(
    'block-1', jsonb_build_object(
      'id', 'block-1',
      'type', 'rich-text',
      'content', jsonb_build_object(
        'title', '',
        'body', COALESCE(content, ''),
        'format', 'html'
      ),
      'display_order', 1,
      'created_at', created_at,
      'updated_at', updated_at
    )
  ) as content_blocks,
  created_at,
  updated_at
FROM public.posts
WHERE content IS NOT NULL AND content != '';

-- Remove content column from posts table
ALTER TABLE public.posts DROP COLUMN IF EXISTS content;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_post_blocks_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_post_blocks_updated_at
  BEFORE UPDATE ON public.post_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_post_blocks_updated_at();