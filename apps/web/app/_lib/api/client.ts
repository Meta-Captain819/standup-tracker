/**
 * Browser-side fetch to the app's own BFF routes (`/api/*`). Sends/expects JSON, surfaces the BFF error
 * envelope's `message` as a thrown Error, and returns the parsed body (or undefined for a 204). This is
 * the client counterpart to the server-only `apiFetch` in `./http`.
 */
export async function requestJson<T = void>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? "Something went wrong.");
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
