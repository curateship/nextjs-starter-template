CREATE UNIQUE INDEX IF NOT EXISTS ux_browser_sessions_active_node_stream_port
  ON browser_sessions (node_id, stream_port)
  WHERE ended_at IS NULL AND status IN ('starting', 'running', 'stopping');

CREATE UNIQUE INDEX IF NOT EXISTS ux_browser_sessions_active_node_webrtc_start
  ON browser_sessions (node_id, webrtc_start_port)
  WHERE ended_at IS NULL AND status IN ('starting', 'running', 'stopping');
