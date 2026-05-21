# Scalability

This document captures the current scalability direction for Hub and Core.

## Goal

Separate the main system layers so each part can scale independently:

```text
Hub = product/UI layer
Core = data, scraping, and business logic layer
Workers = background job layer
Postgres = source-of-truth storage layer
Redis = queue/cache layer
```

These layers can start on a small number of servers. The important part is keeping the responsibilities separate in code and deployment.

## Recommended Starting Shape

```text
Hub server(s)
Core API server(s)
Core worker server(s)
Postgres data server
Redis/queue server, when needed
Object storage for exports/files
```

Early on, Core, workers, and Postgres can live on the same stronger server if cost matters. As load grows, split them into separate servers.

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
- long analytics queries
- queue volume and scheduling

App servers and workers are easier to multiply. Postgres and analytics storage require more careful design.

## 50M Rows

If we know the platform will reach around 50M scraped-data rows, design for that from the start.

50M rows is serious, but not automatically a reason to create one database per site. A strong Postgres setup can handle this if the schema is clean.

Recommended database approach:

- Use one main Postgres database at first.
- Put `site_id` or `tenant_id` on every scraped-data table.
- Add indexes based on the real queries the app runs.
- Partition the largest tables, usually by date or by site/date.
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

## Splitting Databases

We can split databases later. That is usually called sharding when data is distributed across multiple databases.

Do not start there unless needed, because it adds complexity:

- routing each site/customer to the right database
- running migrations across multiple databases
- backups and restores per database
- global reports across sites
- moving a site between databases
- keeping admin tooling simple

Better path:

```text
1 shared Postgres
-> partition big tables
-> add read replicas/cache
-> add analytics storage if needed
-> shard by tenant/site only when the database proves it is necessary
```

## Dedicated Infrastructure Per Site

The default should not be one server or database per site.

Most sites should share the same Core infrastructure. A large site can get special treatment only when it dominates the workload.

Possible later options:

- dedicated worker queue
- dedicated worker server
- dedicated database shard
- dedicated analytics storage

This should be based on measured database, worker, and storage pressure, not assumed up front.

## Short Version

Use shared infrastructure first. Separate Hub, Core, workers, Postgres, and Redis as layers. Scale app servers and workers horizontally. Treat Postgres and analytics storage as the main scaling constraints. Split databases only when the data layer proves it needs that complexity.
