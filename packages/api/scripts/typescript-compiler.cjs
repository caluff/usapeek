const path = require("node:path");
const { spawnSync } = require("node:child_process");

function runTypeScript(args, options = {}) {
  const manifestPath = require.resolve("typescript/package.json");
  const manifest = require(manifestPath);
  const executable = path.resolve(path.dirname(manifestPath), manifest.bin.tsc);
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`TypeScript was interrupted by ${result.signal}`);
  }
  return result;
}

module.exports = { runTypeScript };
