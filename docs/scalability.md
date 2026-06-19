# Scalability

This document captures the current scalability direction for Hub and Core.

## Goal

Separate the main system layers so each part can scale independently:

```text
Hub = product/UI layer
Core = scraping and business logic layer
Workers = background job layer
Workspace data servers = workspace data storage layer
Redis = queue/cache layer
```

These layers can start on a small number of servers. The important part is keeping the responsibilities separate in code and deployment.

## Recommended Starting Shape

```text
Hub server(s)
Core API server(s)
Core worker server(s)
Default workspace data server
Redis/queue server, when needed
Object storage for exports/files
```

Early on, Core, workers, and the default data server can live on the same stronger server if cost matters. As load grows, split them into separate servers.

## Workspace Data Servers

Workspace data servers are the preferred storage placement model.

Each workspace can be assigned to a data server in workspace settings:

```text
workspace -> data server setting -> Core writes and reads workspace data there
```

Core stays the logic layer. Data servers only store workspace data.

Small workspaces can share the default data server. Heavy data workspaces can get their own data server. Medium workspaces can share a stronger data server. This keeps the system flexible without turning every workspace into a separate app stack.

This is not the same as duplicating Hub or Core per workspace. Hub, Core, workers, auth, billing, and workspace membership can remain shared. The data-server setting only controls where workspace data is stored.

Actual downsides worth planning for:

- Core has to support multiple database connection targets.
- The platform loses the simplicity of one database endpoint for all workspace data.
- Features that require one SQL query across every workspace's data are harder.

Everything else is implementation detail:

- workspace settings store the assigned data server
- Core routes workspace-scoped data through that setting
- new data servers are provisioned consistently
- schema changes are applied consistently if the data schema changes

## What Scales Easily

These parts can usually scale horizontally:

- Hub app servers behind a load balancer
- Core API servers behind a load balancer
- Core worker servers by adding more workers

Adding servers helps most with app traffic, API traffic, and background job throughput.

## Main Bottlenecks

The real limits are usually the data layer:

- database write throughput
- database read/query performance
- index size and maintenance
- storage growth
- queue volume and scheduling

App servers and workers are easier to multiply. Workspace data storage requires more careful placement.

## 50M Rows

If we know the platform will reach around 50M scraped-data rows, design for that from the start.

50M rows is serious, but not automatically a reason to put every workspace on a dedicated data server. The workspace data-server model allows both shared and dedicated storage.

Recommended database approach:

- Use one default workspace data server at first.
- Put `workspace_id` on every scraped-data table.
- Add indexes based on the real queries the app runs.
- Partition the largest tables, usually by date or by workspace/date.
- Keep raw scrape results separate from normalized/current data.
- Avoid making dashboards query huge history tables directly.
- Use summary tables or materialized views for common reports.

Likely large tables:

- `keywords`
- `keyword_snapshots`
- `rankings_history`
- `serp_results`
- `scrape_jobs`
- `scrape_runs`

Likely partition candidates:

- `rankings_history`
- `serp_results`
- `scrape_runs`

## Data Server Assignment

The default should be shared data storage, not one data server per workspace.

Dedicated data servers are available when a workspace is expected to be heavy or already produces enough data to justify isolation.

Possible workspace assignments:

- default shared data server
- stronger shared data server
- dedicated data server

The assignment can be made in workspace settings. The first version only needs stable assignment. Moving an existing workspace between data servers can be deferred unless it becomes necessary.

## Short Version

Use shared infrastructure first. Separate Hub, Core, workers, workspace data servers, and Redis as layers. Core owns the logic. Data servers only store workspace data. Small workspaces can share a data server, and heavy workspaces can get dedicated storage through workspace settings.
