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
# The iPhone tools: Apple's USB channel from Python, and WebDriverAgent,
# the test tool that reads and taps an iPhone's screen. Both need a Mac
# with Xcode for the signing; a Linux rack drives Androids only.
PYMOBILEDEVICE3_VERSION="11.34.1"
# WDA_VERSION is only words for the messages. A tag can be moved, so the
# download is pinned to one commit and refused if what arrived is any other.
WDA_VERSION="v16.15.3"
# The commit the v16.15.3 tag pointed at on 18 Oct 2026, so a moved tag can never change what gets signed.
WDA_COMMIT="02cb92f0e93c8b021443bcbb8eeb80932c113220"
WDA_REPO="https://github.com/appium/WebDriverAgent.git"

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
# The iPhone driver sits beside the program, whichever computer this is; an
# Android-only rack simply never imports it.
curl -fsSL "$PROMO_URL/api/rack/iphone.py" -o "$RACK_HOME/incoming_iphone.py"

export PROMO_RACK_HOME="$RACK_HOME"
"$RACK_HOME/venv/bin/python" "$RACK_HOME/launcher.py" pair \
  --url "$PROMO_URL" --code "$CODE" --program "$RACK_HOME/incoming.py" --driver "$RACK_HOME/incoming_iphone.py"
rm -f "$RACK_HOME/incoming.py" "$RACK_HOME/incoming_iphone.py"

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

# ---------------------------------------------------------------------------
# iPhones. Only a Mac with Xcode (the full app, not just the command line
# tools) can sign WebDriverAgent, so anything else prints why and moves on.
# The Android install above is finished by now, so nothing here can break it.

has_xcode() {
  [ "$(uname -s)" = "Darwin" ] || return 1
  local developer_dir
  developer_dir="$(xcode-select -p 2>/dev/null || true)"
  case "$developer_dir" in
    *Xcode.app*) xcodebuild -version >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

# Fetches the one pinned commit into $WDA_DIR and refuses to go on if what
# is checked out is any other commit, so a moved tag or a wrong fetch can
# never put a different WebDriverAgent on the rack.
fetch_wda_commit() {
  git -C "$WDA_DIR" fetch --quiet --depth 1 origin "$WDA_COMMIT"
  git -C "$WDA_DIR" checkout --quiet FETCH_HEAD
  local checked_out
  checked_out="$(git -C "$WDA_DIR" rev-parse HEAD)"
  if [ "$checked_out" != "$WDA_COMMIT" ]; then
    echo "WebDriverAgent is not the pinned version: wanted commit $WDA_COMMIT, got $checked_out. Nothing was built." >&2
    exit 1
  fi
}

# The script a person runs to sign WebDriverAgent with their Apple ID, and
# again every week when the free signature runs out. Written here so the
# install command stays one file.
write_wda_script() {
  cat > "$RACK_HOME/wda.sh" <<'WDA'
#!/bin/bash
# Builds WebDriverAgent and signs it with the Apple ID set up in Xcode, so
# the rack can read and tap the iPhones. A free Apple ID's signature lasts
# 7 days; run this again when the Phones dashboard says it is running out:
#
#   bash ~/Library/Application\ Support/PromoRack/wda.sh
#
# The first time, with no Apple ID in Xcode yet, it opens the project in
# Xcode and says what to click. `--quiet` (used by the install command)
# never opens Xcode; it builds if signing is set up and otherwise prints
# the command to run.
set -euo pipefail

RACK_HOME="$(cd "$(dirname "$0")" && pwd)"
WDA="$RACK_HOME/WebDriverAgent"
PROJECT="$WDA/WebDriverAgent.xcodeproj"
TEAM_FILE="$RACK_HOME/wda-team.txt"
BUILD_LOG="$RACK_HOME/wda-build.log"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

if [ ! -d "$PROJECT" ]; then
  echo "WebDriverAgent is not downloaded. Run the install command from the Phones dashboard again." >&2
  exit 1
fi
if ! xcodebuild -version >/dev/null 2>&1; then
  echo "Xcode is not installed, or the command line tools are selected instead of it." >&2
  echo "Install Xcode from the App Store, open it once, then run: sudo xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi

# The team is the Apple ID's own ten-letter id, read off the signing
# certificate Xcode made when the Apple ID was added, and kept in a file so
# a second certificate later does not change it.
TEAM="$(cat "$TEAM_FILE" 2>/dev/null || true)"
if [ -z "$TEAM" ]; then
  TEAM="$(security find-identity -v -p codesigning 2>/dev/null \
    | grep 'Apple Development' | head -1 | sed -n 's/.*(\([A-Z0-9]\{10\}\)).*/\1/p' || true)"
fi
if [ -z "$TEAM" ]; then
  if [ "$QUIET" = 1 ]; then
    echo "No Apple ID is set up in Xcode yet, so WebDriverAgent is not signed and iPhones cannot be driven."
    echo "To drive iPhones, run: bash \"$RACK_HOME/wda.sh\""
    exit 0
  fi
  echo "Xcode has no Apple ID yet. Opening WebDriverAgent in Xcode. In Xcode:"
  echo "  1. Xcode > Settings > Accounts, press +, pick Apple ID, and sign in. A free Apple ID is fine."
  echo "  2. In the left list, click the WebDriverAgent project, then WebDriverAgentRunner under Targets."
  echo "  3. Open Signing & Capabilities, tick Automatically manage signing, and choose your name as the Team."
  echo "  4. Close Xcode and run this again: bash \"$RACK_HOME/wda.sh\""
  open "$PROJECT"
  exit 0
fi
echo "$TEAM" > "$TEAM_FILE"

# A free Apple ID needs its own bundle id, and its signature only runs on
# phones it has registered, so every iPhone plugged in now is registered
# before the final build.
BUNDLE_ID="com.promorack.$(echo "$TEAM" | tr '[:upper:]' '[:lower:]').WebDriverAgentRunner"
build() {
  xcodebuild build-for-testing \
    -project "$PROJECT" -scheme WebDriverAgentRunner \
    -derivedDataPath "$WDA/build" \
    -allowProvisioningUpdates "$@" \
    DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic \
    PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
    >> "$BUILD_LOG" 2>&1
}

: > "$BUILD_LOG"
UDIDS="$("$RACK_HOME/venv/bin/python" -c '
from pymobiledevice3 import usbmux
for device in usbmux.list_devices():
    if device.connection_type == "USB":
        print(device.serial)
' 2>/dev/null || true)"
for UDID in $UDIDS; do
  echo "Registering the iPhone $UDID with the Apple ID..."
  if ! build -destination "id=$UDID" -allowProvisioningDeviceRegistration; then
    echo "Could not register $UDID; the last lines of $BUILD_LOG:"
    tail -20 "$BUILD_LOG"
    echo "If the phone shows Trust this computer, tap Trust and run this again."
    exit 1
  fi
done

echo "Building WebDriverAgent signed by $TEAM (a few minutes the first time)..."
if ! build -destination 'generic/platform=iOS'; then
  echo "The build failed; the last lines of $BUILD_LOG:"
  tail -30 "$BUILD_LOG"
  echo "If Xcode asks for the Apple ID's password or a two-factor code, open the project once in Xcode, finish signing there, and run this again."
  exit 1
fi
if ! ls "$WDA"/build/Build/Products/WebDriverAgentRunner_iphoneos*.xctestrun >/dev/null 2>&1; then
  echo "The build finished but wrote no .xctestrun file; see $BUILD_LOG" >&2
  exit 1
fi
printf '{"signedAt": "%s", "days": 7}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$RACK_HOME/wda.json"
echo "WebDriverAgent is signed. A free Apple ID's signature runs out in 7 days; the Phones dashboard will say when to run this again."
echo "An iPhone plugged in after this needs registering: run this script again with it plugged in."
WDA
  chmod +x "$RACK_HOME/wda.sh"
}

if has_xcode; then
  echo "Setting up the iPhone tools..."
  "$RACK_HOME/venv/bin/pip" install --quiet --disable-pip-version-check "pymobiledevice3==$PYMOBILEDEVICE3_VERSION"
  if ! command -v git >/dev/null 2>&1; then
    echo "git is missing, so WebDriverAgent was not downloaded. Run: xcode-select --install, then the install command again."
  else
    WDA_DIR="$RACK_HOME/WebDriverAgent"
    if [ ! -d "$WDA_DIR/.git" ]; then
      echo "Downloading WebDriverAgent $WDA_VERSION..."
      mkdir -p "$WDA_DIR"
      git -C "$WDA_DIR" init --quiet
      git -C "$WDA_DIR" remote add origin "$WDA_REPO"
      fetch_wda_commit
    elif [ "$(git -C "$WDA_DIR" rev-parse HEAD 2>/dev/null || true)" != "$WDA_COMMIT" ]; then
      echo "Moving WebDriverAgent to $WDA_VERSION..."
      fetch_wda_commit
      rm -rf "$WDA_DIR/build"
    fi
    write_wda_script
    bash "$RACK_HOME/wda.sh" --quiet || echo "WebDriverAgent did not build; see $RACK_HOME/wda-build.log. To try again, run: bash \"$RACK_HOME/wda.sh\""
    echo "To drive iPhones, or to re-sign WebDriverAgent when its week is up, run: bash \"$RACK_HOME/wda.sh\""
  fi
elif [ "$(uname -s)" = "Darwin" ]; then
  echo "iPhones: skipped. Driving an iPhone needs Xcode (the full app from the App Store, not only the command line tools) to sign WebDriverAgent."
  echo "Install Xcode, open it once, run: sudo xcode-select -s /Applications/Xcode.app, and run this install command again."
else
  echo "iPhones: skipped. Driving an iPhone needs a Mac with Xcode to sign WebDriverAgent; this rack drives Androids only."
fi
echo "The rack shows on the Phones dashboard within a minute."
