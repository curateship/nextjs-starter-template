import { sql, type SQLWrapper } from "drizzle-orm"

import type { DirectoryNearPoint } from "@/lib/directory/public-search"

/**
 * How far a position is from a point, in kilometres, along the Earth's
 * surface. Null when the position has no latitude or longitude, so a filter
 * like `distance <= 5` leaves it out and an order puts it last.
 *
 * The directory's listings and the Events page's events both measure with
 * this, so "within 5 km" means the same on both pages. It imports nothing but
 * Drizzle, because the public reads build their column lists when they load.
 */
export function distanceKmFrom(
  near: DirectoryNearPoint,
  latitude: SQLWrapper,
  longitude: SQLWrapper
) {
  return sql<
    number | null
  >`case when ${latitude} is null or ${longitude} is null then null else 6371 * 2 * asin(least(1, sqrt(
    power(sin(radians(${latitude} - ${near.latitude}) / 2), 2)
    + cos(radians(${near.latitude})) * cos(radians(${latitude}))
    * power(sin(radians(${longitude} - ${near.longitude}) / 2), 2)
  ))) end`
}
