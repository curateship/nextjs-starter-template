// Makes the Sounds panel's starter pack: thirty short sound effects, each
// drawn by ffmpeg from sums rather than recorded, so every one is this app's
// own work and carries no licence of anybody else's.
//
// Run from the app's folder with `node scripts/make-starter-sounds.mjs`. It
// writes each sound twice, because two different programs read them:
//   public/sounds/<id>.mp3        what the editor plays in the browser
//   src/server/assets/sounds/     what the export reads from disk, which the
//                                 worker build copies beside its bundle
// and prints each one's length for `src/lib/video/stock-sounds.ts`.
//
// `n` below is a sample of noise between -1 and 1, and `e(k)` a decay that
// falls by k a second. Every sound is mono at 44.1kHz and ends faded, so none
// clicks when it stops.

import { spawnSync } from "node:child_process"
import { mkdirSync, copyFileSync } from "node:fs"
import path from "node:path"

const n = "(2*random(0)-1)"
const e = (k) => `exp(-${k}*t)`
const sweep = (from, to, seconds) =>
  `sin(2*PI*(${from}*t+(${to}-${from})*t*t/(2*${seconds})))`

// id: [seconds, expression, extra filters]
const SOUNDS = {
  whoosh: [0.7, `${n}*sin(PI*t/0.7)^2`, "highpass=f=300,lowpass=f=2800"],
  "fast-whoosh": [0.35, `${n}*sin(PI*t/0.35)^2`, "highpass=f=600,lowpass=f=4000"],
  swipe: [0.22, `${n}*sin(PI*t/0.22)`, "highpass=f=1800"],
  whip: [0.15, `${n}*${e(30)}*min(1,t*400)`, "highpass=f=2800"],
  pop: [0.15, `sin(2*PI*(380*t+20*(1-${e(30)})))*${e(28)}`, ""],
  "bubble-pop": [0.14, `${sweep(300, 1300, 0.14)}*${e(22)}`, ""],
  click: [0.04, `${n}*${e(180)}`, "highpass=f=2000"],
  tick: [0.06, `sin(2*PI*2200*t)*${e(120)}`, ""],
  ding: [1.6, `(sin(2*PI*880*t)+0.5*sin(2*PI*1760*t)+0.25*sin(2*PI*2640*t))*0.55*${e(3)}`, ""],
  chime: [1.8, `(sin(2*PI*1318.5*t)+0.7*sin(2*PI*1975.5*t))*0.55*${e(2.4)}`, ""],
  success: [0.7, `0.7*(lt(t,0.14)*sin(2*PI*659*t)*${e(8)}+gte(t,0.14)*sin(2*PI*988*t)*exp(-5*(t-0.14)))`, ""],
  error: [0.4, `0.35*(2*gt(sin(2*PI*130*t),0)-1)*min(1,(0.4-t)*30)`, "lowpass=f=2500"],
  notification: [0.3, `0.6*(lt(t,0.1)*sin(2*PI*1200*t)+gte(t,0.12)*lt(t,0.24)*sin(2*PI*1600*t))*min(1,(0.3-t)*40)`, ""],
  boing: [0.8, `sin(2*PI*(220*t+0.9*sin(2*PI*9*t)))*${e(3.5)}`, ""],
  riser: [2.0, `(0.5*${n}+0.6*${sweep(200, 1400, 2)})*(t/2)^2`, "highpass=f=150"],
  impact: [1.0, `(sin(2*PI*55*t)*0.9+${n}*${e(18)}*0.6)*${e(5)}`, "lowpass=f=1800"],
  "bass-drop": [1.3, `${sweep(160, 38, 1.3)}*min(1,t*40)*${e(1.8)}`, ""],
  "camera-shutter": [0.2, `${n}*(${e(90)}+gte(t,0.09)*exp(-90*(t-0.09)))*0.8`, "bandpass=f=3000:width_type=h:w=3500"],
  "record-scratch": [0.5, `${n}*(0.5+0.5*sin(2*PI*14*t))*min(1,(0.5-t)*20)`, "bandpass=f=1400:width_type=h:w=1800"],
  typewriter: [0.12, `(${n}*${e(140)}*0.8+sin(2*PI*180*t)*${e(40)}*0.5)`, ""],
  "keyboard-tap": [0.07, `${n}*${e(120)}*0.6`, "bandpass=f=1800:width_type=h:w=2000"],
  clap: [0.3, `${n}*(${e(60)}+gte(t,0.012)*exp(-60*(t-0.012))+gte(t,0.025)*exp(-14*(t-0.025)))*0.6`, "bandpass=f=1600:width_type=h:w=1800"],
  snap: [0.12, `${n}*${e(70)}`, "highpass=f=2500"],
  kick: [0.45, `${sweep(150, 45, 0.45)}*${e(7)}`, ""],
  snare: [0.3, `(${n}*0.7+sin(2*PI*190*t)*0.4)*${e(14)}`, "highpass=f=120"],
  heartbeat: [0.9, `(${sweep(90, 50, 0.15)}*lt(t,0.18)*${e(14)}+gte(t,0.26)*lt(t,0.46)*sin(2*PI*70*(t-0.26))*exp(-14*(t-0.26))*0.8)`, "lowpass=f=400"],
  glitch: [0.45, `0.5*(2*gt(sin(2*PI*(90+800*mod(floor(t*24),5))*t),0)-1)*gt(sin(2*PI*31*t),-0.3)*min(1,(0.45-t)*30)`, "lowpass=f=4000"],
  laser: [0.32, `${sweep(2200, 220, 0.32)}*min(1,(0.32-t)*25)*0.8`, ""],
  coin: [0.5, `0.4*(2*gt(sin(2*PI*(lt(t,0.08)*988+gte(t,0.08)*1319)*t),0)-1)*${e(5)}`, "lowpass=f=5000"],
  beep: [0.2, `0.6*sin(2*PI*1000*t)*min(1,t*200)*min(1,(0.2-t)*200)`, ""],
}

const app = process.cwd()
const browserDir = path.join(app, "public/sounds")
const serverDir = path.join(app, "src/server/assets/sounds")
mkdirSync(browserDir, { recursive: true })
mkdirSync(serverDir, { recursive: true })

for (const [id, [seconds, expression, filters]] of Object.entries(SOUNDS)) {
  const file = path.join(browserDir, `${id}.mp3`)
  // A short fade at each end, then the loudest moment brought to -1dB, so
  // the whole pack plays at one level.
  const chain = [filters, "afade=t=in:d=0.003", `afade=t=out:st=${Math.max(0, seconds - 0.02)}:d=0.02`, "dynaudnorm=f=75:g=3:p=0.89"]
    .filter(Boolean)
    .join(",")
  const result = spawnSync("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", `aevalsrc='${expression}':s=44100:d=${seconds}`,
    "-af", chain,
    "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k",
    file,
  ])
  if (result.status !== 0) {
    throw new Error(`${id}: ${result.stderr.toString()}`)
  }
  copyFileSync(file, path.join(serverDir, `${id}.mp3`))
  console.log(`${id}\t${Math.round(seconds * 1000)}ms`)
}
