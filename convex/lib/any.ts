import { v, type VAny, type Value } from 'convex/values'

/**
 * Convex's unrestricted runtime validator defaults its TypeScript type to
 * `any`. Preserve its exact runtime behavior while exposing Convex's recursive
 * `Value` union so consumers must narrow dynamic data before use.
 */
export const anyValue: VAny<Value> = v.any()
