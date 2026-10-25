export class ApiError extends Error {
  status:number;
  constructor(status:number,message:string) {
    super(message);
    this.status=status;
  }
}
export async function request<T = Record<string, any>>(
  token: string | undefined,
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!form && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const result = await response
    .json()
    .catch(() => ({ error: "The server returned an unreadable response" }));
  if (!response.ok)
    throw new ApiError(response.status, result.error ?? "Request failed");
  return result as T;
}
