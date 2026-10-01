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
import type * as nutritionsValidator from "../nutritionsValidator.js";
import type * as productMatching from "../productMatching.js";
import type * as productSearch from "../productSearch.js";
import type * as products from "../products.js";
import type * as reviews from "../reviews.js";
import type * as shortId from "../shortId.js";
import type * as storage from "../storage.js";
import type * as storageOwnership from "../storageOwnership.js";
import type * as uploadSecret from "../uploadSecret.js";
import type * as uploads from "../uploads.js";
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
  nutritionsValidator: typeof nutritionsValidator;
  productMatching: typeof productMatching;
  productSearch: typeof productSearch;
  products: typeof products;
  reviews: typeof reviews;
  shortId: typeof shortId;
  storage: typeof storage;
  storageOwnership: typeof storageOwnership;
  uploadSecret: typeof uploadSecret;
  uploads: typeof uploads;
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
