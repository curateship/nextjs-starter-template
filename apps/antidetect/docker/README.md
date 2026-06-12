# Phase 0 — Stealth + Streaming Bake-off (the gate)

Before building any product code, prove the two genuinely hard unknowns:

1. **Stealth** — can a compiled anti-detect fork run *inside a container* and pass
   fingerprint detectors while routed through a proxy?
2. **Streaming** — does driving that browser by hand over **WebRTC** feel usable?

If both pass, the cloud-streaming architecture is viable and we proceed to Phase 1.
If not, we learn it now — for the cost of two Docker builds — not in month three.

This directory is **throwaway de-risk scaffolding**, intentionally minimal. It is
independent of the `antidetect` app.

---

## How it's wired

Each engine runs inside [**Neko**](https://github.com/m1k1o/neko), which already
provides the Xvfb virtual display + WebRTC streamer + web client. We only add the
browser and a supervisord entry that launches it on Neko's display:

```
your browser ──HTTP/WebRTC──> Neko (in container) ──renders──> anti-detect browser
                                                                   │ egress
                                                                   ▼
                                                              your proxy ──> the web
```

- **Candidate 1 — Camoufox** (Firefox fork): turnkey; the patched binary is fetched
  at build time. Launched via its Python API (`camoufox/launch-camoufox.py`).
- **Candidate 2 — itbrowser** (Chromium fork): opt-in; needs the release verified
  (see below). Launched as `chrome --itbrowser=fingerprint.json`.

---

## Prerequisites

- **Docker** + Docker Compose (confirmed: Docker 28 / Compose v2 on this machine).
- **A proxy.** Residential or mobile strongly preferred — without one you're testing
  the datacenter IP of wherever Docker runs, which detectors flag instantly. This is
  the one thing you must supply.
- Apple Silicon note: Camoufox ships arm64 Linux binaries, so it builds natively.
  itbrowser is likely x64-only — if its build fails on arm, add `platform: linux/amd64`
  to that service (runs under emulation; fine for a stealth check).

## Run it

```bash
cd apps/antidetect/docker
cp .env.example .env          # then edit .env and put in your proxy

# Candidate 1 (Camoufox) — first build pulls Neko + fetches the browser (~minutes)
docker compose up --build camoufox
#  -> open http://localhost:8080   (login: user / neko)

# Candidate 2 (itbrowser) — opt-in
docker compose --profile itbrowser up --build itbrowser
#  -> open http://localhost:8081
```

In the Neko page you'll see the anti-detect browser. Click the control/lock icon to
take control, then drive it by hand.

## The stealth gauntlet

The browser opens on CreepJS by default. Visit each and record the result:

| Test | URL | What to look for |
|---|---|---|
| CreepJS | https://abrahamjuliot.github.io/creepjs/ | Trust score, lies count, "headless"/"stealth" flags |
| BrowserLeaks Canvas | https://browserleaks.com/canvas | Unique signature, no automation tells |
| Pixelscan | https://pixelscan.net | "Consistent" verdict, not "automated/inconsistent" |
| iphey | https://iphey.com | "Trustworthy" across software/hardware/proxy |
| CreepJS WebRTC | https://browserleaks.com/webrtc | **No proxy/real-IP leak** — must show only the proxy IP |

### Record results here

| Engine | CreepJS trust | Lies | Pixelscan | iphey | WebRTC leak? | Stream feel | Verdict |
|---|---|---|---|---|---|---|---|
| Camoufox | | | | | | | |
| itbrowser | | | | | | | |

## Decision gate

**PASS** (proceed to Phase 1) if at least one engine:
- shows a believable, consistent fingerprint (no "automation"/"headless"/"inconsistent"),
- leaks **no** real IP via WebRTC (only the proxy IP), and
- is usable to click around manually over the stream without painful lag.

**FAIL** → reconsider before investing further: try the other engine, try CloakBrowser
(compiled Chromium fork, Linux build) as a drop-in for Candidate 2, or revisit the
run model (e.g. local desktop instead of cloud-streamed).

---

## Candidate 2 (itbrowser) — what to verify

The Dockerfile downloads the upstream `.7z`. On first build confirm:
1. It contains a **Linux x64** Chromium build (not Windows-only). If Windows-only,
   switch to **CloakBrowser** (`cloakhq/chromium-stealth-builds`, Linux x64).
2. The real binary path inside the archive → update `command=` in
   `itbrowser/supervisord.conf` (currently assumes `/opt/itbrowser/chrome`).
3. The fingerprint JSON schema → fix `itbrowser/fingerprint.example.json`
   (current fields are the documented spoofable params but the exact key names are
   unverified).

## Troubleshooting

- **Black stream / can't connect:** WebRTC media ports. Ensure the `udp` range is
  published (it is in compose) and `NEKO_WEBRTC_NAT1TO1=127.0.0.1` for local use.
- **Neko env rejected:** these are v3 variable names. If the base image is v2, use
  `NEKO_SCREEN`, `NEKO_PASSWORD`, `NEKO_PASSWORD_ADMIN`, `NEKO_EPR`, `NEKO_ICELITE`,
  `NEKO_NAT1TO1` instead.
- **Camoufox can't find its binary:** the build fetches it as the `neko` user; if the
  base image's user differs, adjust the `HOME=/home/neko` / `chown` lines in the
  Dockerfile and the `user=` in supervisord.
- **Browser blank/crashes:** raise `shm_size`.

## Cleanup

```bash
docker compose down -v        # also removes the persistent profile volumes
```
