/**
 * Plan features are free-form per product, but always JSON-safe scalars so they
 * survive the trip from the database to the browser unchanged.
 */
export type PlanFeatureValue = string | number | boolean | null

export type PlanFeatures = Record<string, PlanFeatureValue>
