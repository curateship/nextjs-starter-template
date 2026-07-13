update workspaces
set settings = settings || jsonb_build_object('sidebarWidth', 218),
    updated_at = current_timestamp
where not (settings ? 'sidebarWidth');
