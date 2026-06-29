# itbrowser (anti-detect Chromium) running inside Neko.
#
# CANDIDATE 2 — needs verification on first build (see README "Candidate 2"):
#   * The upstream release is a single .7z; confirm it contains a Linux x64 build
#     (not Windows-only) and find the actual chrome binary path inside it.
#   * The fingerprint JSON schema is the project's own — adjust fingerprint.example.json.
# If this proves not Linux-friendly, swap to CloakBrowser (also a compiled Chromium
# fork with a Linux build) per the README fallback note.
FROM ghcr.io/m1k1o/neko/base:latest

USER root

# Latest release as of writing is v1.0.1 (note the upstream filename typo
# "finngerprints"). Verified to exist (~245MB). Override at build time:
#   docker build --build-arg ITBROWSER_URL=... ./itbrowser
ARG ITBROWSER_URL=https://github.com/itbrowser-net/undetectable-fingerprint-browser/releases/download/v1.0.1/finngerprints-browser-v1.0.1.7z

RUN apt-get update \
 && apt-get install -y --no-install-recommends p7zip-full ca-certificates wget \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /opt/itbrowser \
 && wget -O /tmp/itb.7z "$ITBROWSER_URL" \
 && 7z x /tmp/itb.7z -o/opt/itbrowser \
 && rm /tmp/itb.7z \
 && chown -R neko:neko /opt/itbrowser

# Sample fingerprint + supervisord program entry.
COPY fingerprint.example.json /data/fingerprint.json
COPY supervisord.conf /etc/neko/supervisord/itbrowser.conf
RUN mkdir -p /data/profile /var/log/neko && chown -R neko:neko /data /var/log/neko
