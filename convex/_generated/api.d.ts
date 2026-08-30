/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_d from "../admin/d.js";
import type * as admin_m from "../admin/m.js";
import type * as admin_q from "../admin/q.js";
import type * as lib_any from "../lib/any.js";
import type * as lib_auth from "../lib/auth.js";
import type * as snapSettings_d from "../snapSettings/d.js";
import type * as snapSettings_m from "../snapSettings/m.js";
import type * as snapSettings_q from "../snapSettings/q.js";
import type * as snaps_d from "../snaps/d.js";
import type * as snaps_m from "../snaps/m.js";
import type * as snaps_q from "../snaps/q.js";
import type * as users_m from "../users/m.js";
import type * as users_q from "../users/q.js";
import type * as users_v from "../users/v.js";
import type * as utils from "../utils.js";
import type * as verificationEntries_d from "../verificationEntries/d.js";
import type * as verificationEntries_helpers from "../verificationEntries/helpers.js";
import type * as verificationEntries_m from "../verificationEntries/m.js";
import type * as verificationEntries_q from "../verificationEntries/q.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/d": typeof admin_d;
  "admin/m": typeof admin_m;
  "admin/q": typeof admin_q;
  "lib/any": typeof lib_any;
  "lib/auth": typeof lib_auth;
  "snapSettings/d": typeof snapSettings_d;
  "snapSettings/m": typeof snapSettings_m;
  "snapSettings/q": typeof snapSettings_q;
  "snaps/d": typeof snaps_d;
  "snaps/m": typeof snaps_m;
  "snaps/q": typeof snaps_q;
  "users/m": typeof users_m;
  "users/q": typeof users_q;
  "users/v": typeof users_v;
  utils: typeof utils;
  "verificationEntries/d": typeof verificationEntries_d;
  "verificationEntries/helpers": typeof verificationEntries_helpers;
  "verificationEntries/m": typeof verificationEntries_m;
  "verificationEntries/q": typeof verificationEntries_q;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
