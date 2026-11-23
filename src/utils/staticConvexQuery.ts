import { queryOptions } from "@tanstack/react-query";
import { ConvexHttpClient } from "convex/browser";
import {
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  getFunctionName,
} from "convex/server";

/**
 * Query options for public menu data (cafes, products) that changes only when
 * the daily sync runs.
 *
 * Unlike `convexQuery`, this fetches once over HTTP and never opens a live
 * WebSocket subscription: the page is server-rendered with this data and
 * cached at the CDN until the next sync purges it, so keeping every visitor
 * subscribed would only spend Convex function calls and database bandwidth.
 * The query key prefix is not "convexQuery", so ConvexQueryClient leaves these
 * queries alone. Use `convexQuery` for anything users change (reviews, the
 * signed-in user).
 *
 * Only for queries that don't read `ctx.auth`: requests are unauthenticated.
 */
let httpClient: ConvexHttpClient | undefined;

const getHttpClient = () => {
  if (!httpClient) {
    const convexUrl = import.meta.env.VITE_CONVEX_URL;
    if (!convexUrl) {
      throw new Error("missing VITE_CONVEX_URL envar");
    }
    httpClient = new ConvexHttpClient(convexUrl);
  }
  return httpClient;
};

export const staticConvexQuery = <Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>
) =>
  queryOptions({
    queryKey: ["convexStatic", getFunctionName(query), args] as const,
    queryFn: (): Promise<FunctionReturnType<Query>> =>
      getHttpClient().query(query, args),
    staleTime: Number.POSITIVE_INFINITY,
  });
