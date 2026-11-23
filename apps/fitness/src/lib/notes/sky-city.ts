import { z } from "zod"

import { skyPhaseAt, type SkyPhase } from "@/lib/notes/page-cover"

/**
 * The city the cover sky follows (Tyler, 8 Nov 2026: "we need a time zone
 * setting because it shows the sun and its almost night here", then picking
 * "Real sun times for a city"). Settings → General → Sky city finds it by
 * name once; from where it is, the sky works out that day's real sunrise and
 * sunset, so it follows the seasons on its own. No city: the fixed hours in
 * `skyPhaseAt`.
 */
export const skyCitySchema = z.object({
  /** "Toronto, Ontario", as the search found it. */
  label: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

export type SkyCity = z.infer<typeof skyCitySchema>

/** A stored city read back; anything else reads as none. */
export function readSkyCity(value: unknown): SkyCity | null {
  const parsed = skyCitySchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

// Sunrise and sunset by the sun's position, as the widely used SunCalc
// library works them out (Vladimir Agafonkin, after NOAA's method), to within
// a minute or two. Everything is in radians and Julian days.
const RAD = Math.PI / 180
const DAY_MS = 86_400_000
const J1970 = 2_440_588
const J2000 = 2_451_545
const TILT = RAD * 23.4397
const J0 = 0.0009
/** The sun's centre 0.833° below the horizon: its edge, with the air's bending. */
const RISE_SET_ANGLE = RAD * -0.833

const toDays = (at: Date) => at.valueOf() / DAY_MS - 0.5 + J1970 - J2000
const fromJulian = (julian: number) => new Date((julian + 0.5 - J1970) * DAY_MS)
const meanAnomaly = (days: number) => RAD * (357.5291 + 0.98560028 * days)

function eclipticLongitude(anomaly: number) {
  const centre = RAD * (1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly))
  return anomaly + centre + RAD * 102.9372 + Math.PI
}

const transit = (ds: number, anomaly: number, longitude: number) =>
  J2000 + ds + 0.0053 * Math.sin(anomaly) - 0.0069 * Math.sin(2 * longitude)

/**
 * The sunrise and sunset of the solar day `at` falls in, at a place. Null for
 * both on a day the sun never sets or never rises there, with `up` saying
 * which.
 */
export function sunTimes(at: Date, latitude: number, longitude: number) {
  const west = RAD * -longitude
  const phi = RAD * latitude
  const days = toDays(at)
  const cycle = Math.round(days - J0 - west / (2 * Math.PI))
  const ds = J0 + west / (2 * Math.PI) + cycle
  const anomaly = meanAnomaly(ds)
  const eclipticLong = eclipticLongitude(anomaly)
  const declination = Math.asin(Math.sin(eclipticLong) * Math.sin(TILT))
  const noon = transit(ds, anomaly, eclipticLong)
  const cosHour =
    (Math.sin(RISE_SET_ANGLE) - Math.sin(phi) * Math.sin(declination)) / (Math.cos(phi) * Math.cos(declination))
  if (cosHour < -1 || cosHour > 1) {
    return { sunrise: null, sunset: null, up: cosHour < -1 }
  }
  const hourAngle = Math.acos(cosHour)
  const setJulian = transit(J0 + (hourAngle + west) / (2 * Math.PI) + cycle, anomaly, eclipticLong)
  return { sunrise: fromJulian(noon - (setJulian - noon)), sunset: fromJulian(setJulian), up: true }
}

const MINUTE = 60_000

/**
 * The sky at a moment, by the city's real sun when there is one, with the
 * same stretches as the fixed hours: a sunrise for the hour after the sun
 * comes up, gold for the 90 minutes before it sets, a sunset for the hour
 * after, and night until the next sunrise.
 */
export function skyPhaseFor(at: Date, city: SkyCity | null): SkyPhase {
  if (!city) return skyPhaseAt(at)
  const { sunrise, sunset, up } = sunTimes(at, city.latitude, city.longitude)
  if (!sunrise || !sunset) return up ? "day" : "night"
  const now = at.valueOf()
  if (now < sunrise.valueOf()) return "night"
  if (now < sunrise.valueOf() + 60 * MINUTE) return "sunrise"
  if (now < sunset.valueOf() - 90 * MINUTE) return "day"
  if (now < sunset.valueOf()) return "golden"
  if (now < sunset.valueOf() + 60 * MINUTE) return "sunset"
  return "night"
}
