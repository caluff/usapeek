const TYPESCRIPT_API_CONSUMERS = new Set([
  "typescript-eslint",
  "@typescript-eslint/parser",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/typescript-estree",
  "@typescript-eslint/utils",
  "@typescript-eslint/type-utils",
  "@typescript-eslint/project-service",
  "@typescript-eslint/tsconfig-utils",
  "ts-api-utils",
  "ts-node",
  "@medusajs/eslint-plugin",
]);

const ESLINT_COMPAT_PLUGINS = new Map([
  ["eslint-plugin-react", "7.37.5"],
  ["eslint-plugin-import", "2.32.0"],
  ["eslint-plugin-jsx-a11y", "6.10.2"],
  ["@medusajs/eslint-plugin", "2.21.2"],
]);

function readPackage(pkg) {
  if (TYPESCRIPT_API_CONSUMERS.has(pkg.name)) {
    // These tools import the legacy JS API; project tsc commands use TS7.
    pkg.dependencies = {
      ...pkg.dependencies,
      typescript: "npm:@typescript/typescript6@6.0.2",
    };
    delete pkg.peerDependencies?.typescript;
  }

  if (
    ["@medusajs/framework", "@medusajs/types"].includes(pkg.name) &&
    pkg.version === "2.21.2"
  ) {
    // Medusa keeps its original Redis implementation; application clients use 6.
    pkg.dependencies = { ...pkg.dependencies, ioredis: "5.11.1" };
    delete pkg.peerDependencies?.ioredis;
  }

  if (pkg.name === "fdir" && pkg.version === "6.1.1") {
    // This native tooling version requires picomatch 3 even in standalone builds.
    pkg.dependencies = { ...pkg.dependencies, picomatch: "3.0.1" };
    delete pkg.peerDependencies?.picomatch;
  }

  if (ESLINT_COMPAT_PLUGINS.get(pkg.name) === pkg.version) {
    // The repository wraps legacy plugin APIs with @eslint/compat and tests them.
    pkg.peerDependencies.eslint += " || ^10.0.0";
  }

  if (pkg.name === "cva" && pkg.version === "1.0.0-beta.1") {
    // This optional peer describes declaration syntax, not a compiler API import.
    pkg.peerDependencies.typescript += " || ^7.0.0";
  }

  return pkg;
}

export const hooks = { readPackage };
