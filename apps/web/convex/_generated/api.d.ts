/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as answers from "../answers.js";
import type * as dashboard from "../dashboard.js";
import type * as fixes from "../fixes.js";
import type * as ideas from "../ideas.js";
import type * as interest from "../interest.js";
import type * as lib from "../lib.js";
import type * as officers from "../officers.js";
import type * as players from "../players.js";
import type * as schedule from "../schedule.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as stats from "../stats.js";
import type * as teamNames from "../teamNames.js";
import type * as teams from "../teams.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  answers: typeof answers;
  dashboard: typeof dashboard;
  fixes: typeof fixes;
  ideas: typeof ideas;
  interest: typeof interest;
  lib: typeof lib;
  officers: typeof officers;
  players: typeof players;
  schedule: typeof schedule;
  seed: typeof seed;
  sessions: typeof sessions;
  stats: typeof stats;
  teamNames: typeof teamNames;
  teams: typeof teams;
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
