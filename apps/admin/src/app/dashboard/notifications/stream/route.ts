import { proxyAdminEventStream } from "@/lib/admin-event-stream";

export function GET(request: Request) {
  return proxyAdminEventStream(request, "/admin/notifications/stream");
}
