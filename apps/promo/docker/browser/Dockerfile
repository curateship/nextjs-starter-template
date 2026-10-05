# Camoufox (anti-detect Firefox) running inside Neko, with a command port.
#
# Copied from apps/anti-detect/docker/camoufox/Dockerfile rather than shared.
# Pointing promo at that app's image would put two apps in one file, which is
# the fork problem the shell rules exist to prevent: anti-detect's launcher
# sleeps forever on purpose, and promo's has to serve commands.
#
# Neko's base image already bundles Xvfb + WebRTC + supervisord + the web client;
# we only add the browser, the launcher and the per-network routines.
FROM ghcr.io/m1k1o/neko/base:latest

USER root

# Python runtime for the Camoufox launcher library, plus a compiler.
#
# The compiler is not optional and it cost a failed build to find out. The
# geoip extra pulls in `indexed-zstd`, which ships no wheel for this image's
# Python and builds itself from C on install. Without build-essential,
# python3-dev and the zstd headers, `pip install` stops with "Failed to build
# installable wheels for indexed-zstd" and there is no image. They are removed
# again below, so the toolchain does not ride along into production.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-dev \
      build-essential pkg-config libzstd-dev \
 && rm -rf /var/lib/apt/lists/*

# Install Camoufox into an isolated venv. The [geoip] extra lets it align the
# fingerprint's timezone/locale/geolocation to the proxy exit IP, which is what
# stops a US exit IP sitting on a Moscow clock.
ENV CAMOUFOX_VENV=/opt/camoufox
RUN python3 -m venv "$CAMOUFOX_VENV" \
 && "$CAMOUFOX_VENV/bin/pip" install --no-cache-dir "camoufox[geoip]"

# Bake the patched Firefox binary + geoip DB into the image (fast startup, no
# first-run download). Fetch with HOME set to the neko runtime user's home so the
# launcher — which runs as that user — finds the cached binary.
RUN HOME=/home/neko "$CAMOUFOX_VENV/bin/camoufox" fetch \
 && chown -R neko:neko /home/neko/.cache

# The launcher and one routines module per social network. Adding a network is
# adding a file to routines/ — this line already copies it.
RUN mkdir -p /opt/promo
COPY launch.py        /opt/promo/launch.py
COPY routines/        /opt/promo/routines/
COPY supervisord.conf /etc/neko/supervisord/camoufox.conf

# The toolchain has done its job. Dropping it keeps a build compiler out of a
# container that browses the internet.
RUN apt-get purge -y --auto-remove build-essential python3-dev pkg-config libzstd-dev \
 && rm -rf /var/lib/apt/lists/*

# Persistent profile dir (cookies/storage) + a place for launcher logs.
RUN mkdir -p /data/profile /var/log/neko && chown -R neko:neko /data /var/log/neko /opt/promo
