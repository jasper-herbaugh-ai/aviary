import { getAuthToken } from "./auth";

export function apiBase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function authHeaders(extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = authHeaders(options.headers);
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    cache: "no-store",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    let message = `Failed to fetch ${path}: ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignore malformed error responses
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function apiMutation(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  await apiFetch(path, { method, body });
}
