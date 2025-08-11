/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as cafes from "../cafes.js";
import type * as dataUploader from "../dataUploader.js";
import type * as http from "../http.js";
import type * as imageDownloader from "../imageDownloader.js";
import type * as price_history from "../price_history.js";
import type * as products from "../products.js";
import type * as reviews from "../reviews.js";
import type * as shortId from "../shortId.js";
import type * as stats from "../stats.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  cafes: typeof cafes;
  dataUploader: typeof dataUploader;
  http: typeof http;
  imageDownloader: typeof imageDownloader;
  price_history: typeof price_history;
  products: typeof products;
  reviews: typeof reviews;
  shortId: typeof shortId;
  stats: typeof stats;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
