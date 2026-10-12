import { FetchError } from "@medusajs/js-sdk";
import { createAdminSdk, getAdminToken } from "@/lib/auth-sdk";

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "private, no-store, no-transform",
  "X-Accel-Buffering": "no",
};

export async function proxyAdminEventStream(
  request: Request,
  path: "/admin/notifications/stream",
) {
  const token = await getAdminToken();
  if (!token)
    return new Response(null, { status: 401, headers: STREAM_HEADERS });
  const accountId = new URL(request.url).searchParams.get("account_id");
  if (!accountId)
    return new Response(null, { status: 409, headers: STREAM_HEADERS });
  const sdk = createAdminSdk(token);
  if (!sdk) return new Response(null, { status: 503, headers: STREAM_HEADERS });

  const upstream = new AbortController();
  let timer = setTimeout(() => upstream.abort(), 15_000);
  try {
    const response = await sdk.client.fetch<Response>(path, {
      // The authenticated backend checks the current actor before opening SSE.
      headers: {
        accept: "text/event-stream",
        "x-admin-account-id": accountId,
      },
      cache: "no-store",
      signal: AbortSignal.any([request.signal, upstream.signal]),
    });
    clearTimeout(timer);
    if (!response.body)
      throw new Error("Admin notification stream unavailable");
    const reader = response.body.getReader();
    timer = setTimeout(() => upstream.abort(), 75_000);
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            clearTimeout(timer);
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          clearTimeout(timer);
          upstream.abort();
          controller.error(error);
        }
      },
      async cancel() {
        clearTimeout(timer);
        upstream.abort();
        await reader.cancel().catch(() => {});
      },
    });
    return new Response(body, { headers: STREAM_HEADERS });
  } catch (error) {
    clearTimeout(timer);
    upstream.abort();
    const status =
      error instanceof FetchError && [401, 403, 404, 409].includes(error.status ?? 0)
        ? error.status === 401
          ? 401
          : error.status === 409
            ? 409
            : 403
        : 503;
    return new Response(null, { status, headers: STREAM_HEADERS });
  }
}
