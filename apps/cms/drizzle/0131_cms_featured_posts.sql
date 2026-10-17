-- Featured posts.
--
-- An admin features a post with a switch in the post's window. A featured post
-- goes to the top of the Posts page and first in a front page row of posts,
-- newest first among the featured ones.
--
-- This is a free editorial flag on the post and nothing else. Featured
-- listings and events are bought through Stripe and kept in the
-- directory_featured_* tables; a post has no plan, no checkout and no
-- placement, and this file touches none of those tables.

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "featured" boolean NOT NULL DEFAULT false;
