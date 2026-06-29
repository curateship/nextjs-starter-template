# Camoufox (anti-detect Firefox) running inside Neko.
# Neko's base image already bundles Xvfb + WebRTC + supervisord + the web client;
# we only add the browser and tell supervisord how to launch it.
FROM ghcr.io/m1k1o/neko/base:latest

USER root

# Python runtime for the Camoufox launcher library.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*

# Install Camoufox into an isolated venv. The [geoip] extra lets it align the
# fingerprint's timezone/locale/geolocation to the proxy exit IP.
ENV CAMOUFOX_VENV=/opt/camoufox
RUN python3 -m venv "$CAMOUFOX_VENV" \
 && "$CAMOUFOX_VENV/bin/pip" install --no-cache-dir "camoufox[geoip]"

# Bake the patched Firefox binary + geoip DB into the image (fast startup, no
# first-run download). Fetch with HOME set to the neko runtime user's home so the
# launcher — which runs as that user — finds the cached binary.
RUN HOME=/home/neko "$CAMOUFOX_VENV/bin/camoufox" fetch \
 && chown -R neko:neko /home/neko/.cache

# Launcher script + supervisord program entry. Neko auto-loads any *.conf in
# /etc/neko/supervisord/ at boot.
COPY launch-camoufox.py /opt/launch-camoufox.py
COPY supervisord.conf  /etc/neko/supervisord/camoufox.conf

# Persistent profile dir (cookies/storage) + a place for launcher logs.
RUN mkdir -p /data/profile /var/log/neko && chown -R neko:neko /data /var/log/neko
