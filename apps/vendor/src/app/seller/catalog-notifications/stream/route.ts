import { proxyVendorEventStream } from "@/lib/vendor-event-stream";

export async function GET(request: Request) {
  return proxyVendorEventStream(request, "/vendor/catalog-notifications/stream");
}
