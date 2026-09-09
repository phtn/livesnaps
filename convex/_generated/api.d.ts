/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountMembers_d from "../accountMembers/d.js";
import type * as accountMembers_helpers from "../accountMembers/helpers.js";
import type * as accountMembers_m from "../accountMembers/m.js";
import type * as accountMembers_q from "../accountMembers/q.js";
import type * as accounts_d from "../accounts/d.js";
import type * as accounts_helpers from "../accounts/helpers.js";
import type * as accounts_m from "../accounts/m.js";
import type * as accounts_q from "../accounts/q.js";
import type * as admin_d from "../admin/d.js";
import type * as admin_m from "../admin/m.js";
import type * as admin_q from "../admin/q.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_any from "../lib/any.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_r2 from "../lib/r2.js";
import type * as lib_submissionAccess from "../lib/submissionAccess.js";
import type * as lib_workspaceAccess from "../lib/workspaceAccess.js";
import type * as resendWebhooks_d from "../resendWebhooks/d.js";
import type * as resendWebhooks_m from "../resendWebhooks/m.js";
import type * as resendWebhooks_q from "../resendWebhooks/q.js";
import type * as snapSettings_d from "../snapSettings/d.js";
import type * as snapSettings_m from "../snapSettings/m.js";
import type * as snapSettings_q from "../snapSettings/q.js";
import type * as snaps_d from "../snaps/d.js";
import type * as snaps_handlers from "../snaps/handlers.js";
import type * as snaps_m from "../snaps/m.js";
import type * as snaps_q from "../snaps/q.js";
import type * as submissionLinks_d from "../submissionLinks/d.js";
import type * as submissionLinks_email from "../submissionLinks/email.js";
import type * as submissionLinks_helpers from "../submissionLinks/helpers.js";
import type * as submissionLinks_m from "../submissionLinks/m.js";
import type * as submissionLinks_q from "../submissionLinks/q.js";
import type * as users_m from "../users/m.js";
import type * as users_q from "../users/q.js";
import type * as users_v from "../users/v.js";
import type * as utils from "../utils.js";
import type * as verificationEntries_d from "../verificationEntries/d.js";
import type * as verificationEntries_helpers from "../verificationEntries/helpers.js";
import type * as verificationEntries_m from "../verificationEntries/m.js";
import type * as verificationEntries_pdf from "../verificationEntries/pdf.js";
import type * as verificationEntries_q from "../verificationEntries/q.js";
import type * as verificationEntries_uploads from "../verificationEntries/uploads.js";
import type * as vision_logs_d from "../vision_logs/d.js";
import type * as vision_logs_m from "../vision_logs/m.js";
import type * as vision_logs_q from "../vision_logs/q.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "accountMembers/d": typeof accountMembers_d;
  "accountMembers/helpers": typeof accountMembers_helpers;
  "accountMembers/m": typeof accountMembers_m;
  "accountMembers/q": typeof accountMembers_q;
  "accounts/d": typeof accounts_d;
  "accounts/helpers": typeof accounts_helpers;
  "accounts/m": typeof accounts_m;
  "accounts/q": typeof accounts_q;
  "admin/d": typeof admin_d;
  "admin/m": typeof admin_m;
  "admin/q": typeof admin_q;
  crons: typeof crons;
  http: typeof http;
  "lib/any": typeof lib_any;
  "lib/auth": typeof lib_auth;
  "lib/email": typeof lib_email;
  "lib/r2": typeof lib_r2;
  "lib/submissionAccess": typeof lib_submissionAccess;
  "lib/workspaceAccess": typeof lib_workspaceAccess;
  "resendWebhooks/d": typeof resendWebhooks_d;
  "resendWebhooks/m": typeof resendWebhooks_m;
  "resendWebhooks/q": typeof resendWebhooks_q;
  "snapSettings/d": typeof snapSettings_d;
  "snapSettings/m": typeof snapSettings_m;
  "snapSettings/q": typeof snapSettings_q;
  "snaps/d": typeof snaps_d;
  "snaps/handlers": typeof snaps_handlers;
  "snaps/m": typeof snaps_m;
  "snaps/q": typeof snaps_q;
  "submissionLinks/d": typeof submissionLinks_d;
  "submissionLinks/email": typeof submissionLinks_email;
  "submissionLinks/helpers": typeof submissionLinks_helpers;
  "submissionLinks/m": typeof submissionLinks_m;
  "submissionLinks/q": typeof submissionLinks_q;
  "users/m": typeof users_m;
  "users/q": typeof users_q;
  "users/v": typeof users_v;
  utils: typeof utils;
  "verificationEntries/d": typeof verificationEntries_d;
  "verificationEntries/helpers": typeof verificationEntries_helpers;
  "verificationEntries/m": typeof verificationEntries_m;
  "verificationEntries/pdf": typeof verificationEntries_pdf;
  "verificationEntries/q": typeof verificationEntries_q;
  "verificationEntries/uploads": typeof verificationEntries_uploads;
  "vision_logs/d": typeof vision_logs_d;
  "vision_logs/m": typeof vision_logs_m;
  "vision_logs/q": typeof vision_logs_q;
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
