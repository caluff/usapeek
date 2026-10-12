const fs = require("node:fs");
const path = require("node:path");
const ts = require("@typescript/typescript6");
const { runTypeScript } = require("./typescript-compiler.cjs");

const COMPILER_OPTIONS = {
  strict: true,
  target: ts.ScriptTarget.ES2021,
  module: ts.ModuleKind.Node16,
  moduleResolution: ts.ModuleResolutionKind.Node16,
};

function createContractProgram(sources, { skipLibCheck = true } = {}) {
  return ts.createProgram(sources, { ...COMPILER_OPTIONS, skipLibCheck });
}

function renderTypeAliases(program, sources) {
  const checker = program.getTypeChecker();
  return sources
    .flatMap((source) =>
      program
        .getSourceFile(source)
        .statements.filter(ts.isTypeAliasDeclaration),
    )
    .map((node) => {
      const rendered = checker.typeToString(
        checker.getTypeAtLocation(node),
        node,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias,
      );
      return `export type ${node.name.text} = ${rendered};`;
    })
    .join("\n");
}

function writeOrCheckContract(
  target,
  result,
  staleMessage,
  isCheck = process.argv.includes("--check"),
) {
  if (isCheck) {
    if (
      !fs.existsSync(target) ||
      fs.readFileSync(target, "utf8").replaceAll("\r\n", "\n") !== result
    ) {
      throw new Error(staleMessage);
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, result);
  }
  return isCheck;
}

function checkContractDeclarations(sources, failureMessage) {
  const result = runTypeScript([
    "--ignoreConfig",
    "--strict",
    "--target",
    "ES2021",
    "--module",
    "Node16",
    "--moduleResolution",
    "Node16",
    "--noEmit",
    "--pretty",
    "false",
    ...sources,
  ]);
  if (result.status !== 0) {
    console.error(result.stdout + result.stderr);
    throw new Error(failureMessage);
  }
}

module.exports = {
  createContractProgram,
  renderTypeAliases,
  writeOrCheckContract,
  checkContractDeclarations,
};
