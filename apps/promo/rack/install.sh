#!/bin/bash
# Installs Promo's rack program on the computer the phones plug into, pairs it
# with one code from the Phones dashboard, and sets it up to start with the
# computer. Promo serves this file at /api/rack/install.sh with its own
# address written in below. Run it again with a new code to pair afresh.
#
#   curl -fsSL https://promo.example/api/rack/install.sh | bash -s -- ABCD-EFGH
#
# Everything goes in one folder of the person's own: nothing needs sudo except
# keeping a Linux service running while nobody is signed in.
set -euo pipefail

PROMO_URL="__PROMO_URL__"
CODE="${1:-}"
UIAUTOMATOR2_VERSION="3.7.0"

if [ -z "$CODE" ]; then
  echo "Give the code from the Phones dashboard: ... | bash -s -- ABCD-EFGH" >&2
  exit 1
fi

case "$(uname -s)" in
  Darwin)
    RACK_HOME="$HOME/Library/Application Support/PromoRack"
    TOOLS_ZIP="platform-tools-latest-darwin.zip"
    ;;
  Linux)
    RACK_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/promo-rack"
    TOOLS_ZIP="platform-tools-latest-linux.zip"
    ;;
  *)
    echo "The rack program runs on macOS or Linux." >&2
    exit 1
    ;;
esac
mkdir -p "$RACK_HOME"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is missing. On a Mac run: xcode-select --install. On Linux: sudo apt install python3 python3-venv" >&2
  exit 1
fi
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'; then
  echo "Python 3.9 or newer is needed. This computer has $(python3 --version)." >&2
  exit 1
fi

# Android's own USB tools, kept in the rack's folder so nothing else changes.
if [ ! -x "$RACK_HOME/platform-tools/adb" ]; then
  if ! command -v unzip >/dev/null 2>&1; then
    echo "unzip is missing. On Linux run: sudo apt install unzip" >&2
    exit 1
  fi
  echo "Downloading Android's platform tools..."
  curl -fsSL "https://dl.google.com/android/repository/$TOOLS_ZIP" -o "$RACK_HOME/platform-tools.zip"
  (cd "$RACK_HOME" && unzip -q -o platform-tools.zip && rm platform-tools.zip)
fi

echo "Setting up Python..."
if [ ! -x "$RACK_HOME/venv/bin/python" ]; then
  python3 -m venv "$RACK_HOME/venv"
fi
"$RACK_HOME/venv/bin/pip" install --quiet --disable-pip-version-check "uiautomator2==$UIAUTOMATOR2_VERSION"

echo "Downloading the rack program..."
curl -fsSL "$PROMO_URL/api/rack/launcher.py" -o "$RACK_HOME/launcher.py"
curl -fsSL "$PROMO_URL/api/rack/program.py" -o "$RACK_HOME/incoming.py"

export PROMO_RACK_HOME="$RACK_HOME"
"$RACK_HOME/venv/bin/python" "$RACK_HOME/launcher.py" pair \
  --url "$PROMO_URL" --code "$CODE" --program "$RACK_HOME/incoming.py"
rm -f "$RACK_HOME/incoming.py"

PYTHON="$RACK_HOME/venv/bin/python"
LAUNCHER="$RACK_HOME/launcher.py"
TOOLS_PATH="$RACK_HOME/platform-tools:/usr/bin:/bin:/usr/sbin:/sbin"

if [ "$(uname -s)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.systemeverything.promo-rack.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.systemeverything.promo-rack</string>
  <key>ProgramArguments</key>
  <array><string>$PYTHON</string><string>$LAUNCHER</string><string>run</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PROMO_RACK_HOME</key><string>$RACK_HOME</string>
    <key>PATH</key><string>$TOOLS_PATH</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$RACK_HOME/rack.log</string>
  <key>StandardErrorPath</key><string>$RACK_HOME/rack.log</string>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$(id -u)/com.systemeverything.promo-rack" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "Started. It starts again by itself whenever you sign in to this Mac. Its log is $RACK_HOME/rack.log"
else
  UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/promo-rack.service" <<UNIT
[Unit]
Description=Promo rack program
After=network-online.target

[Service]
Environment=PROMO_RACK_HOME=$RACK_HOME
Environment=PATH=$TOOLS_PATH
ExecStart=$PYTHON $LAUNCHER run
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now promo-rack.service
  if ! loginctl enable-linger "$USER" >/dev/null 2>&1; then
    echo "To keep it running when nobody is signed in, run once: sudo loginctl enable-linger $USER"
  fi
  echo "Started. It starts again by itself with the computer. Its log: journalctl --user -u promo-rack"
fi
echo "The rack shows on the Phones dashboard within a minute."
