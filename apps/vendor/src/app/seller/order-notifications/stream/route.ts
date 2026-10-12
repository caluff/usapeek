import { proxyVendorEventStream } from "@/lib/vendor-event-stream";

export function GET(request: Request) {
  return proxyVendorEventStream(request, "/vendor/order-notifications/stream");
}
