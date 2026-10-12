const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const SETTING_KEYS = [
  "patchedDependencies",
  "overrides",
  "packageExtensions",
  "allowBuilds",
  "minimumReleaseAgeExclude",
];

function readPnpmSetting(key, workspaceRoot) {
  if (!SETTING_KEYS.includes(key))
    throw new Error("Unsupported deployment setting");
  // Only fixed setting names enter the command; paths are passed through cwd.
  // Using pnpm's reader preserves its YAML semantics and absolute patch paths.
  return JSON.parse(
    execSync(`pnpm config get ${key} --json`, {
      cwd: workspaceRoot,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}

function prepareDeployment({
  workspaceRoot,
  deploymentRoot,
  readSetting = readPnpmSetting,
}) {
  const manifestPath = path.join(deploymentRoot, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rootManifest = JSON.parse(
    fs.readFileSync(path.join(workspaceRoot, "package.json"), "utf8"),
  );
  const settings = { packages: ["."] };
  for (const key of SETTING_KEYS) {
    const value = readSetting(key, workspaceRoot);
    if (value !== null && value !== undefined) settings[key] = value;
  }
  const patches = settings.patchedDependencies;
  if (!patches || typeof patches !== "object" || !Object.keys(patches).length) {
    throw new Error("Deployment requires the workspace dependency patches.");
  }
  const patchDirectory = path.join(deploymentRoot, "patches");
  const copies = Object.entries(patches).map(([dependency, file]) => {
    if (typeof file !== "string")
      throw new Error(`Invalid patch path for ${dependency}`);
    const source = path.resolve(workspaceRoot, file);
    const relative = path.relative(workspaceRoot, source);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`Patch must be inside the workspace: ${dependency}`);
    }
    return {
      dependency,
      source,
      name: path.basename(source),
      contents: fs.readFileSync(source),
    };
  });
  if (new Set(copies.map((copy) => copy.name)).size !== copies.length) {
    throw new Error("Deployment patch filenames must be unique.");
  }
  fs.mkdirSync(patchDirectory, { recursive: true });
  settings.patchedDependencies = {};
  for (const copy of copies) {
    fs.writeFileSync(path.join(patchDirectory, copy.name), copy.contents);
    settings.patchedDependencies[copy.dependency] = `patches/${copy.name}`;
  }
  // JSON is valid YAML, so this needs no additional deployment dependency.
  fs.writeFileSync(
    path.join(deploymentRoot, "pnpm-workspace.yaml"),
    `${JSON.stringify(settings, null, 2)}\n`,
  );
  fs.copyFileSync(
    path.join(workspaceRoot, ".pnpmfile.mjs"),
    path.join(deploymentRoot, ".pnpmfile.mjs"),
  );
  manifest.packageManager = rootManifest.packageManager;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return settings;
}

if (require.main === module) {
  const workspaceRoot = path.resolve(__dirname, "../../..");
  prepareDeployment({
    workspaceRoot,
    deploymentRoot: path.resolve(__dirname, "../.medusa/server"),
  });
  console.log(
    "Prepared standalone deployment with workspace dependency patches.",
  );
}

module.exports = { prepareDeployment };
