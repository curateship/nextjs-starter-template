# Camoufox (anti-detect Firefox) running inside Neko, with a command port.
#
# Copied from apps/anti-detect/docker/camoufox/Dockerfile rather than shared.
# Pointing promo at that app's image would put two apps in one file, which is
# the fork problem the shell rules exist to prevent: anti-detect's launcher
# sleeps forever on purpose, and promo's has to serve commands.
#
# Neko's base image already bundles Xvfb + WebRTC + supervisord + the web client;
# we only add the browser, the launcher and the routines.
#
# **Both versions are pinned.** This used to build from Neko's "latest" and the
# newest Camoufox on the day, so a rebuild a month later could change the
# Firefox version every profile reports, or the stream's own sign-in page the
# Browser profiles dashboard's window relies on, with nothing in this repo to
# explain it. Moving to a newer one is now a deliberate edit to the two lines
# below, and a thing to test.

# The multi-platform index ghcr.io/m1k1o/neko/base:latest pointed at on 6 Oct
# 2026. One digest covers both the Mac (arm64) and the server (amd64).
ARG NEKO_BASE=ghcr.io/m1k1o/neko/base@sha256:37514a57b987b8987937f335fb24e59c81ce4eb218a3f4fcf2bd1c3dc59b0ad3

# Camoufox's Python package, chosen 6 Oct 2026. It pins its own browser build
# (its browser-pin.json names Firefox 156.0.1, Camoufox beta.34), so pinning
# the package pins the browser `camoufox fetch` downloads.
ARG CAMOUFOX_VERSION=0.5.7

# --- Stage 1: build. Everything that needs a compiler happens here and stays here.
#
# The compiler is not optional: the geoip extra pulls in `indexed-zstd`, which
# ships no wheel for this image's Python and builds itself from C on install.
# Without build-essential, python3-dev and the zstd headers there is no image.
# It used to be removed in a later step of a single stage, which made nothing
# smaller: a layer keeps what it added even when a later layer deletes it. The
# compiler layer measured 351MB and the "removal" added 1.74MB on top.
FROM ${NEKO_BASE} AS build
ARG CAMOUFOX_VERSION
USER root

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-dev \
      build-essential pkg-config libzstd-dev \
 && rm -rf /var/lib/apt/lists/*

# An isolated venv. The [geoip] extra lets Camoufox align the clock, language
# and position to the proxy's exit address, which is what stops a US exit
# address sitting on a Moscow clock.
RUN python3 -m venv /opt/camoufox \
 && /opt/camoufox/bin/pip install --no-cache-dir "camoufox[geoip]==${CAMOUFOX_VERSION}"

# The patched Firefox, its fonts and the geoip database, baked in so a browser
# starts without a download. HOME is the neko user's, because the launcher
# runs as that user and looks there.
RUN HOME=/home/neko /opt/camoufox/bin/camoufox fetch

# --- Stage 2: the image that ships. Python to run the launcher, the venv and
# the browser copied from stage 1, and no compiler.
FROM ${NEKO_BASE}
USER root

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /opt/camoufox /opt/camoufox
COPY --from=build --chown=neko:neko /home/neko/.cache/camoufox /home/neko/.cache/camoufox

# The launcher, the shared person-pace helper, and one routines module per
# network. Adding a network is adding a file to routines/: this copies it.
COPY launch.py        /opt/promo/launch.py
COPY human.py         /opt/promo/human.py
COPY routines/        /opt/promo/routines/
COPY supervisord.conf /etc/neko/supervisord/camoufox.conf

# Persistent profile dir (cookies/storage) + a place for launcher logs.
RUN mkdir -p /data/profile /var/log/neko && chown -R neko:neko /data /var/log/neko /opt/promo
