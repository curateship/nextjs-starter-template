# Phase 7: Per-Site MCP Build

  ## Summary

  Build a private remote MCP endpoint for every site at https://{site-domain}/mcp.

  Use one shared MCP implementation with host-based site resolution. Do not create a separate Coolify app or container per site.

  Ship v1 with per-site bearer keys, but isolate auth behind a single internal interface so OAuth 2.1 can replace it later without rewriting the MCP tools.

  Keep the implementation mostly additive and scoped to MCP only.

  ## Key Changes

  ### MCP endpoint

  - Add a stateless Streamable HTTP MCP endpoint at /mcp.
  - Resolve the site from the request host using the existing multi-tenant host-resolution path.
  - Require Authorization: Bearer <site-mcp-key> for access.
  - Return only the resolved site’s tools and data.

  ### MCP key model

  - Add a site_mcp_keys table with:
      - id
      - site_id unique
      - secret_hash
      - key_prefix
      - is_active
      - last_used_at
      - created_at
      - updated_at
  - Store only a hash of the secret, never the plaintext.
  - Support one active key per site in v1.
  - Support generate, rotate, revoke, and status lookup.

  ### MCP auth layer

  - Add a dedicated MCP auth module that:
      - resolves the site from host
      - reads the bearer key
      - hashes and verifies the key with timing-safe comparison
      - returns an internal auth context with site and capabilities
  - Use this auth context in all MCP tools so OAuth can later replace only the auth layer.

  ### MCP tool surface

  Expose tools only in v1.

  Site tools:

  - site.get
  - site.update_settings

  Page tools:

  - pages.list
  - pages.get
  - pages.create
  - pages.update
  - pages.update_blocks

  Post tools:

  - posts.list
  - posts.get
  - posts.create
  - posts.update
  - posts.update_blocks

  Product tools:

  - products.list
  - products.get
  - products.create
  - products.update
  - products.update_blocks

  ### Content behavior

  - Scope every query and mutation to the resolved site.
  - Match current content behavior closely:
      - title required on create
      - slug auto-generated when absent
      - reserved slugs rejected
      - per-site slug collisions rejected
      - timestamps updated on mutation
      - page homepage uniqueness preserved
  - update_blocks replaces the full content_blocks payload.
  - Exclude delete tools in v1.
  - Exclude integrations, newsletters, analytics, billing, category assignment, and media upload in v1.

  ### Admin UI

  - Add a new MCP tab in Site Settings.
  - Add an McpSettingsCard that shows:
      - endpoint URL
      - key status
      - key prefix
      - last used timestamp
      - generate key
      - rotate key
      - revoke key
  - Show plaintext key only once immediately after generate or rotate.

  ## File Plan

  ### Add

  - apps/hub/migrations/125_create_site_mcp_keys.sql
  - apps/hub/src/lib/db/schema/site-mcp-keys.ts
  - apps/hub/src/lib/actions/mcp/site-mcp-actions.ts
  - apps/hub/src/lib/mcp/auth.ts
  - apps/hub/src/lib/mcp/server.ts
  - apps/hub/src/lib/mcp/tools.ts
  - apps/hub/src/app/mcp/route.ts
  - apps/hub/src/components/admin/layout/dashboard/McpSettingsCard.tsx

  ### Edit

  - apps/hub/package.json
  - package-lock.json
  - apps/hub/src/lib/db/schema/index.ts
  - apps/hub/src/app/admin/sites/[siteId]/settings/page.tsx
  - apps/hub/src/lib/actions/pages/page-frontend-actions.ts
      - Only if needed to cleanly reuse host resolution. If not needed, leave unchanged.

  ## Public Interfaces

  ### Endpoint

  - https://{site-domain}/mcp

  ### Auth

  ### Internal auth context
  - siteId
  - site
  - authMode
  - capabilities

  This internal auth context is the contract that allows bearer-key auth to be replaced later by OAuth without changing the tools.

  ## Test Plan

  - Migration creates site_mcp_keys correctly and enforces unique site_id.
  - Key generation stores only a hash and returns plaintext only once.
  - Revoked keys stop working immediately.
  - Valid key works on the matching site domain.
  - Valid key fails on a different site domain.
  - Unknown host returns 404.
  - Missing or invalid bearer key returns 401.
  - site.get returns only the resolved site.
  - pages/posts/products.list return only records for the resolved site.
  - pages/posts/products.create reject reserved or duplicate slugs.
  - pages.update preserves single-homepage behavior.
  - *.update_blocks replaces stored blocks correctly.
  - MCP settings UI can generate, rotate, revoke, and display status correctly.

  ## Assumptions and Defaults

  - V1 is a private bearer-key MCP, not a full OAuth 2.1 protected MCP implementation.
  - OAuth is a later upgrade path, not part of this phase.
  - Every site automatically has an /mcp endpoint, but it is unusable until a key is issued.
  - One active key per site is sufficient for v1.
  - Use one shared MCP implementation for all sites.
  - Keep the implementation additive and avoid refactoring unrelated content logic.

  ## References

  - MCP TypeScript SDK: https://modelcontextprotocol.io/docs/sdk
  - Streamable HTTP transport: https://modelcontextprotocol.io/docs/concepts/transports#streamable-http
  - MCP authorization spec for protected HTTP servers: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization