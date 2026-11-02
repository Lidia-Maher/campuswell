/**
 * The one place the frontend talks to the backend.
 *
 * Types come from src/api/schema.d.ts, which is generated from the backend:
 *     npm run api:types         (from the live API)
 *     npm run api:types:local   (from your laptop's backend)
 * Run it after the backend changes, so a renamed field shows up as a type error here.
 */
import createClient, { type Middleware } from "openapi-fetch";

import { ApiError, toApiError } from "./errors";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type User = Schemas["UserOut"];
export type Role = "student" | "admin" | "counsellor";

export const API_URL: string = import.meta.env.VITE_API_URL || "http://localhost:8000";

// AuthProvider sets this: it returns the current Firebase ID token (or a dev token)
let getToken: () => Promise<string | null> = async () => null;

export function setTokenSource(source: () => Promise<string | null>) {
  getToken = source;
}

const addToken: Middleware = {
  async onRequest({ request }) {
    const token = await getToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
};

export const api = createClient<paths>({ baseUrl: API_URL });
api.use(addToken);

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * Turns an openapi-fetch result into data, or throws an ApiError.
 *     const me = await unwrap(api.GET("/api/me"));
 */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await request;
  } catch {
    // fetch itself failed: offline, or the free server is still waking up
    throw new ApiError(0, "network_error");
  }
  if (!result.response.ok) throw toApiError(result.response.status, result.error);
  return result.data as T;
}
