#!/usr/bin/env bash
# Generates the bundled background-music beds in public/music from pure synthesis
# (layered sine chords → progression loop → mood mastering → MP3). Every track is
# produced here, so the set is royalty-free with no attribution and can be swapped
# for licensed audio later without touching app code. Durations here MUST match
# src/lib/music-library.ts. Requires ffmpeg (libmp3lame). Run from apps/ai-video:
#   bash scripts/generate-music-beds.sh
set -euo pipefail

OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/music"
mkdir -p "$OUT_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Chord expression from up to 4 frequencies (bass → top), with fixed partial gains.
chord() {
  local amp=(0.20 0.16 0.16 0.12) expr="" i=0
  for f in "$@"; do
    [ -n "$expr" ] && expr="$expr+"
    expr="$expr${amp[$i]}*sin(2*PI*$f*t)"
    i=$((i + 1))
  done
  printf '%s' "$expr"
}

# One chord segment with soft attack/release so concatenated chords pulse gently.
seg() { # $1 outfile  $2 seconds  $3 expr
  local out_st
  out_st="$(awk -v d="$2" 'BEGIN{printf "%.3f", d-0.09}')"
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "aevalsrc=${3}:d=${2}:s=44100" \
    -af "afade=t=in:d=0.05,afade=t=out:st=${out_st}:d=0.09" \
    "$1"
}

# Build a track: name, seg length, target length, master chain, then chord exprs.
build() { # $1 id  $2 seg  $3 target  $4 master  $5.. chords
  local id="$1" segdur="$2" target="$3" master="$4"; shift 4
  local list="$TMP/$id.txt"; : >"$list"
  local i=0
  for c in "$@"; do
    seg "$TMP/${id}_${i}.wav" "$segdur" "$c"
    printf "file '%s'\n" "$TMP/${id}_${i}.wav" >>"$list"
    i=$((i + 1))
  done
  ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "$list" -c copy "$TMP/${id}_prog.wav"
  ffmpeg -y -hide_banner -loglevel error -stream_loop -1 -i "$TMP/${id}_prog.wav" \
    -t "$target" -af "${master},alimiter=limit=0.92" \
    -c:a libmp3lame -b:a 128k -ar 44100 -ac 1 "$OUT_DIR/${id}.mp3"
  echo "  wrote ${id}.mp3 (${target}s)"
}

echo "Generating music beds → $OUT_DIR"

# Upbeat — Sunrise (C–G–Am–F), bright, 30s
build sunrise 1.0 30 "tremolo=f=4:d=0.22,highpass=f=55,dynaudnorm=f=250:g=6" \
  "$(chord 130.81 261.63 329.63 392.00)" \
  "$(chord 196.00 246.94 293.66 392.00)" \
  "$(chord 220.00 261.63 329.63 440.00)" \
  "$(chord 174.61 261.63 349.23 440.00)"

# Upbeat — Neon Drive (D–A–Bm–G), driving pulse, 20s
build neon-drive 0.5 20 "tremolo=f=6:d=0.30,highpass=f=55,dynaudnorm=f=250:g=6" \
  "$(chord 146.83 293.66 369.99 440.00)" \
  "$(chord 110.00 277.18 329.63 440.00)" \
  "$(chord 123.47 293.66 369.99 493.88)" \
  "$(chord 98.00 293.66 392.00 493.88)"

# Chill — Daydream (Fmaj7–Am7–Dm7–C), warm lo-fi, 30s
build daydream 2.0 30 "lowpass=f=1500,aecho=0.8:0.85:70:0.2,dynaudnorm=f=250:g=6" \
  "$(chord 174.61 261.63 329.63 440.00)" \
  "$(chord 220.00 261.63 329.63 392.00)" \
  "$(chord 146.83 220.00 261.63 349.23)" \
  "$(chord 130.81 261.63 329.63 392.00)"

# Chill — Still Water (Cmaj7–Em7), sparse ambient, 45s
build still-water 4.0 45 "lowpass=f=1200,aecho=0.8:0.88:800:0.3,dynaudnorm=f=300:g=5" \
  "$(chord 130.81 196.00 246.94 329.63)" \
  "$(chord 164.81 246.94 293.66 392.00)"

# Cinematic — Skyline (Am–F–C–G), swelling, 45s
build skyline 3.0 45 "lowpass=f=1800,aecho=0.85:0.9:900:0.35,dynaudnorm=f=300:g=5" \
  "$(chord 110.00 220.00 261.63 329.63)" \
  "$(chord 87.31 174.61 261.63 349.23)" \
  "$(chord 130.81 196.00 261.63 329.63)" \
  "$(chord 98.00 196.00 246.94 293.66)"

# Corporate — Boardroom (C–Am–F–G), clean and steady, 24s
build boardroom 1.0 24 "highpass=f=65,lowpass=f=3200,dynaudnorm=f=250:g=6" \
  "$(chord 130.81 261.63 329.63 392.00)" \
  "$(chord 110.00 261.63 329.63 440.00)" \
  "$(chord 174.61 261.63 349.23 440.00)" \
  "$(chord 196.00 293.66 392.00 493.88)"

echo "Done."
