const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");
const { setTimeout: delay } = require("node:timers/promises");
const Redis = require("ioredis");

const DIAGNOSTIC_COMMANDS = new Set(["info"]);
const OPERATIONAL_COMMANDS = new Set([
  "auth", "hello", "select", "command", "config", "ping", "reset", "quit",
]);

function localRedisUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("REDIS_URL must be a valid local Redis URL.");
  }
  if (
    !["redis:", "rediss:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.search || url.hash
  ) {
    throw new Error("Redis diagnostics require a loopback Redis URL without connection overrides.");
  }
  return url;
}

function secondsArgument(args) {
  if (!args.length) return 60;
  if (args.length !== 2 || args[0] !== "--seconds" || !/^\d+$/.test(args[1])) {
    throw new Error("Usage: pnpm redis:diagnose [--seconds 5..600]");
  }
  const seconds = Number(args[1]);
  if (seconds < 5 || seconds > 600) throw new Error("Measurement duration must be between 5 and 600 seconds.");
  return seconds;
}

function parseInfo(raw) {
  const fields = {};
  const commands = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    fields[name] = value;
    if (name.startsWith("cmdstat_")) {
      commands[name.slice(8)] = Object.fromEntries(
        value.split(",").map((entry) => {
          const [key, amount] = entry.split("=");
          return [key, Number(amount)];
        }),
      );
    }
  }
  return { fields, commands };
}

function commandDelta(before, after) {
  const result = {};
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const current = after[name] || { calls: 0, usec: 0 };
    const previous = before[name] || {};
    const calls = current.calls - (previous.calls || 0);
    if (calls < 0) throw new Error("Redis statistics were reset during measurement; discard this sample.");
    if (calls && !DIAGNOSTIC_COMMANDS.has(name)) {
      result[name] = { calls, cpuMicroseconds: current.usec - (previous.usec || 0) };
    }
  }
  return result;
}

function summarizeClients(raw) {
  const summary = { total: 0, blocking: 0, subscribers: 0, databases: {} };
  for (const line of raw.trim().split("\n").filter(Boolean)) {
    const fields = Object.fromEntries(line.split(" ").map((entry) => {
      const at = entry.indexOf("=");
      return [entry.slice(0, at), entry.slice(at + 1)];
    }));
    if (fields.name === "usapeek-redis-diagnostics") continue;
    summary.total++;
    if (fields.flags?.includes("b")) summary.blocking++;
    if (Number(fields.sub) + Number(fields.psub) > 0) summary.subscribers++;
    summary.databases[fields.db] = (summary.databases[fields.db] || 0) + 1;
  }
  return summary;
}

async function main() {
  const seconds = secondsArgument(process.argv.slice(2));
  const root = path.resolve(__dirname, "../../..");
  const fileEnvironment = fs.existsSync(path.join(root, ".env"))
    ? parseEnv(fs.readFileSync(path.join(root, ".env"), "utf8"))
    : {};
  const url = localRedisUrl(process.env.REDIS_URL || fileEnvironment.REDIS_URL);
  const client = new Redis(url.href, {
    lazyConnect: true, connectionName: "usapeek-redis-diagnostics",
    connectTimeout: 2_000, commandTimeout: 5_000, maxRetriesPerRequest: 1,
    retryStrategy: () => null, enableOfflineQueue: false,
  });
  // Connection errors can include the endpoint. Only the sanitized main error is printed.
  client.on("error", () => {});
  try {
    await client.connect();
    const clients = summarizeClients(await client.client("LIST"));
    const before = parseInfo(await client.info("all"));
    const started = performance.now();
    await delay(seconds * 1_000);
    const after = parseInfo(await client.info("all"));
    const elapsedSeconds = (performance.now() - started) / 1_000;
    if (after.fields.run_id !== before.fields.run_id) throw new Error("Redis restarted during measurement; discard this sample.");
    const commands = commandDelta(before.commands, after.commands);
    const total = Object.values(commands).reduce((sum, entry) => sum + entry.calls, 0);
    const operational = Object.entries(commands).reduce((sum, [name, entry]) =>
      sum + (OPERATIONAL_COMMANDS.has(name.split("|")[0]) ? entry.calls : 0), 0);
    const slowlog = await client.slowlog("GET", 10);
    const metric = (name) => Number(after.fields[name]) - Number(before.fields[name]);
    console.log(JSON.stringify({
      target: { host: url.hostname, port: url.port || "6379", database: url.pathname.slice(1) || "0" },
      redisVersion: after.fields.redis_version,
      elapsedSeconds, clients,
      executedCommands: total,
      executedCommandsPerMinute: total * 60 / elapsedSeconds,
      operationalCommands: operational,
      commands,
      cpuSeconds: { user: metric("used_cpu_user"), system: metric("used_cpu_sys") },
      memoryBytes: { used: Number(after.fields.used_memory), delta: metric("used_memory") },
      networkBytesIncludingDiagnostics: { input: metric("total_net_input_bytes"), output: metric("total_net_output_bytes") },
      connectionsOpened: metric("total_connections_received"),
      slowlog: slowlog.map((entry) => ({ timestamp: entry[1], executionMicroseconds: entry[2], command: String(entry[3][0]) })),
      notes: [
        "INFO counters cover every logical database on this Redis server. Isolate application processes before attributing traffic.",
        "Executed commands include commands inside Lua. They are not a cloud usage or cost estimate.",
        "INFO calls from this collector are excluded. Operational commands and Docker healthchecks are reported separately.",
        "CPU time and historical SLOWLOG execution time exclude client/network latency. Network bytes include INFO replies.",
      ],
    }, null, 2));
  } finally {
    client.disconnect();
  }
}

module.exports = { localRedisUrl, secondsArgument, parseInfo, commandDelta, summarizeClients };
if (require.main === module) {
  main().catch(() => {
    console.error("Redis diagnostics failed. Check the local endpoint, credentials and duration; no connection details were printed.");
    process.exitCode = 1;
  });
}
