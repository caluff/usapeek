import { isIP } from "node:net";
import type { MedusaRequest } from "@medusajs/framework/http";

export function submissionNetwork(
  req: Pick<MedusaRequest, "ip" | "headers" | "rawHeaders">,
) {
  const ip = req.headers["x-real-ip"];
  // Railway's public ingress supplies the client IP; Medusa's one-hop proxy
  // policy otherwise selects one of Railway's rotating internal proxies.
  // These markers scope trust to Railway ingress, not arbitrary client headers.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.RAILWAY_SERVICE_ID &&
    process.env.RAILWAY_ENVIRONMENT_ID &&
    req.headers["x-forwarded-proto"] === "https" &&
    typeof req.headers["x-railway-edge"] === "string" &&
    typeof req.headers["x-railway-request-id"] === "string" &&
    typeof ip === "string" &&
    isIP(ip) &&
    req.rawHeaders.filter(
      (header, index) =>
        index % 2 === 0 && header.toLowerCase() === "x-real-ip",
    ).length === 1
  ) {
    return ip;
  }
  return req.ip;
}
