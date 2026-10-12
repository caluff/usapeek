import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { asValue } from "@medusajs/framework/awilix";
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const MAX_QUERY_GROUPS = 32;
type QueryTiming = { operation: "graph" | "index"; entity: string; calls: number; completed: number; errors: number; duration_ms: number };
const milliseconds = (value: number) => Math.round(value * 100) / 100;

function routeTemplate(req: MedusaRequest) {
  const route: unknown = req.route?.path;
  return typeof route === "string" && route.length <= 256 && /^\/[a-zA-Z0-9_/:.*{}()-]*$/.test(route) ? route : "unmatched";
}

function entityName(input: unknown) {
  const entity = input && typeof input === "object" && "entity" in input ? input.entity : undefined;
  return typeof entity === "string" && /^[a-z_]{1,64}$/.test(entity) ? entity : "unknown";
}

// This proxy is registered only in this request's scope. Never change the shared
// Query instance: concurrent requests and workers must retain their own context.
function instrumentQueries(req: MedusaRequest, timings: Map<string, QueryTiming>) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY, { allowUnregistered: true });
  if (!query) return;
  const methods = new Map<PropertyKey, unknown>();
  const instrumented = new Proxy(query, {
    get(target, property) {
      const method: unknown = Reflect.get(target, property, target);
      if (typeof method !== "function") return method;
      if (methods.has(property)) return methods.get(property);
      if (property !== "graph" && property !== "index") return method.bind(target);
      const wrapped = async (...args: unknown[]) => {
        const entity = entityName(args[0]);
        const key = `${property}:${entity}`;
        let timing = timings.get(key);
        if (!timing && timings.size < MAX_QUERY_GROUPS) {
          timing = { operation: property, entity, calls: 0, completed: 0, errors: 0, duration_ms: 0 };
          timings.set(key, timing);
        }
        if (timing) timing.calls++;
        const started = performance.now();
        try {
          return await Reflect.apply(method, target, args);
        } catch (error) {
          if (timing) timing.errors++;
          throw error;
        } finally {
          if (timing) {
            timing.completed++;
            timing.duration_ms += performance.now() - started;
          }
        }
      };
      methods.set(property, wrapped);
      return wrapped;
    },
  });
  req.scope.register({ [ContainerRegistrationKeys.QUERY]: asValue(instrumented) });
}

export function performanceTrace(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (process.env.PERFORMANCE_TRACE_ENABLED !== "true") return next();
  const started = performance.now();
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const requestId = typeof req.requestId === "string" && UUID.test(req.requestId) ? req.requestId : randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  const timings = new Map<string, QueryTiming>();
  instrumentQueries(req, timings);
  let recorded = false;
  const record = (aborted: boolean) => {
    if (recorded) return;
    recorded = true;
    res.removeListener("finish", finish);
    res.removeListener("close", close);
    try {
      logger.info(JSON.stringify({
      type: "performance.http",
      request_id: requestId,
      method: ["GET", "HEAD", "POST", "DELETE", "PUT", "PATCH", "OPTIONS"].includes(req.method) ? req.method : "OTHER",
      route: routeTemplate(req),
      status: res.statusCode,
      aborted,
      duration_ms: milliseconds(performance.now() - started),
      query_groups: [...timings.values()].map(timing => ({ ...timing, duration_ms: milliseconds(timing.duration_ms) })),
      }));
    } catch {
      // Diagnostics must not crash a completed response if its logger is closed.
    }
  };
  const finish = () => record(false);
  const close = () => record(!res.writableFinished);
  res.once("finish", finish);
  res.once("close", close);
  next();
}
