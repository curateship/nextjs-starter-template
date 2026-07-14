update "workspaces"
set "settings" = jsonb_set(
  "settings",
  '{sections}',
  (
    select jsonb_agg(
      case
        when jsonb_typeof(section.value->'entries') = 'array' then
          jsonb_set(
            section.value,
            '{entries}',
            coalesce(
              (
                select jsonb_agg(entry.value order by entry.ordinality)
                from jsonb_array_elements(section.value->'entries')
                  with ordinality as entry(value, ordinality)
                where entry.value->>'href' <> '/portfolio'
              ),
              '[]'::jsonb
            )
          )
        else section.value
      end
      order by section.ordinality
    )
    from jsonb_array_elements("settings"->'sections')
      with ordinality as section(value, ordinality)
  )
)
where jsonb_typeof("settings"->'sections') = 'array'
  and jsonb_path_exists(
    "settings",
    '$.sections[*].entries[*] ? (@.href == "/portfolio")'
  );
