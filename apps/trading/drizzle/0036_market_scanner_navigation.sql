update workspaces
set settings = jsonb_set(
  settings,
  '{sections}',
  (
    select jsonb_agg(
      case
        when section->>'id' = 'section-research'
        then jsonb_set(
          section,
          '{entries}',
          jsonb_build_array(
            jsonb_build_object(
              'type', 'item',
              'id', 'item-scanner-market',
              'label', 'Market Scanner',
              'href', '/scanner/market',
              'icon', 'radar',
              'visible', true
            )
          ) || coalesce(section->'entries', '[]'::jsonb)
        )
        else section
      end
      order by section_ord
    )
    from jsonb_array_elements(settings->'sections')
      with ordinality as sections(section, section_ord)
  )
)
where jsonb_typeof(settings->'sections') = 'array'
  and not jsonb_path_exists(
    settings,
    '$.sections[*].entries[*] ? (@.id == "item-scanner-market")'
  );

update workspaces
set settings = jsonb_set(
  settings,
  '{sections}',
  (
    select jsonb_agg(
      case
        when jsonb_path_exists(
          section,
          '$.entries[*] ? (@.href == "/scanner/whales")'
        )
        then jsonb_set(
          section,
          '{entries}',
          jsonb_build_array(
            jsonb_build_object(
              'type', 'item',
              'id', 'item-scanner-market',
              'label', 'Market Scanner',
              'href', '/scanner/market',
              'icon', 'radar',
              'visible', true
            )
          ) || coalesce(section->'entries', '[]'::jsonb)
        )
        else section
      end
      order by section_ord
    )
    from jsonb_array_elements(settings->'sections')
      with ordinality as sections(section, section_ord)
  )
)
where jsonb_typeof(settings->'sections') = 'array'
  and not jsonb_path_exists(
    settings,
    '$.sections[*].entries[*] ? (@.id == "item-scanner-market")'
  )
  and jsonb_path_exists(
    settings,
    '$.sections[*].entries[*] ? (@.href == "/scanner/whales")'
  );

update workspaces
set settings = jsonb_set(
  settings,
  '{sections}',
  (settings->'sections') || jsonb_build_array(
    jsonb_build_object(
      'id', 'section-research',
      'title', 'Research',
      'entries', jsonb_build_array(
        jsonb_build_object(
          'type', 'item',
          'id', 'item-scanner-market',
          'label', 'Market Scanner',
          'href', '/scanner/market',
          'icon', 'radar',
          'visible', true
        )
      )
    )
  )
)
where jsonb_typeof(settings->'sections') = 'array'
  and not jsonb_path_exists(
    settings,
    '$.sections[*].entries[*] ? (@.id == "item-scanner-market")'
  );

update workspaces
set settings = jsonb_set(
  settings,
  '{sections}',
  (
    select jsonb_agg(
      case
        when jsonb_path_exists(
          section,
          '$.entries[*] ? (@.id == "item-scanner-market")'
        )
        then jsonb_set(
          section,
          '{entries}',
          (
            select jsonb_agg(item order by entry_ord, item_ord)
            from jsonb_array_elements(section->'entries')
              with ordinality as entries(entry, entry_ord)
            cross join lateral (
              select entry as item, 0 as item_ord
              union all
              select jsonb_build_object(
                'type', 'item',
                'id', 'item-scanner-market-alerts',
                'label', 'Market Alerts',
                'href', '/scanner/market-alerts',
                'icon', 'bell',
                'visible', true
              ), 1
              where entry->>'id' = 'item-scanner-market'
            ) as expanded
          )
        )
        else section
      end
      order by section_ord
    )
    from jsonb_array_elements(settings->'sections')
      with ordinality as sections(section, section_ord)
  )
)
where jsonb_typeof(settings->'sections') = 'array'
  and not jsonb_path_exists(
    settings,
    '$.sections[*].entries[*] ? (@.id == "item-scanner-market-alerts")'
  );
