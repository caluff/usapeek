const { loadEnv } = require("@medusajs/framework/utils");
loadEnv("test", process.cwd());

module.exports = {
  transform: {
    "[/\\\\]@medusajs[/\\\\]core-flows[/\\\\]dist[/\\\\].+\\.js$":
      "@mercurjs/core/patches/jest-transformer",
    "^.+\\.[jt]s$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
        },
      },
    ],
  },
  transformIgnorePatterns: [
    "[/\\\\]node_modules[/\\\\](?!\\.pnpm[/\\\\]|@medusajs[/\\\\]core-flows[/\\\\]|(?:htmlparser2|domelementtype|domhandler|domutils|dom-serializer|entities)[/\\\\])",
  ],
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["dist/", "<rootDir>/.medusa/"],
  testPathIgnorePatterns: ["/node_modules/", "[/\\\\]\\.medusa[/\\\\]"],
  setupFiles: ["./integration-tests/setup.js"],
  testMatch: [
    "**/integration-tests/http/*.spec.[jt]s",
    "**/src/modules/*/__tests__/**/*.integration.spec.[jt]s",
  ],
};

if (process.env.TEST_TYPE === "integration:http") {
  module.exports.testMatch = ["**/integration-tests/http/*.spec.[jt]s"];
} else if (process.env.TEST_TYPE === "integration:modules") {
  module.exports.testMatch = [
    "**/src/modules/*/__tests__/**/*.integration.spec.[jt]s",
  ];
} else if (process.env.TEST_TYPE) {
  throw new Error(
    `Unsupported integration test type: ${process.env.TEST_TYPE}`,
  );
}
