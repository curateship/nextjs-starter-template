-- Long/short position drawings live beside the trendlines already saved for a
-- chart, so one row still holds everything drawn on one market.
alter table chart_trendlines
  add column positions jsonb not null default '[]'::jsonb;
