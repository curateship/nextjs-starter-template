# Content Template Inheritance

Posts, directory listings, categories, and events use template inheritance.

- Template tables own block structure, order, layout, visibility, and reusable display settings.
- Content rows store a required `template_id` plus only content-specific values in `content_blocks`.
- Builders load merged template + row blocks for editing and preview.
- Row saves must prune incoming blocks against the active template before writing.
- Template saves must sanitize out row-owned values before writing.

For posts, article body fields (`body`, `text`, `format`) are row-owned. Core style/config, related-posts settings, table-of-contents settings, visibility, layout, and block order are template-owned.
