const fs = require("fs"),
  path = require("path"),
  ts = require("typescript");
const root = path.resolve(__dirname, "../..");
const methods = new Set(["get", "post", "put", "patch", "delete"]);
function walk(n, cb) {
  cb(n);
  ts.forEachChild(n, (x) => walk(x, cb));
}
function parse(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}
function text(n) {
  if (!n) return null;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
    return n.text;
  if (ts.isTemplateExpression(n))
    return (
      n.head.text +
      n.templateSpans.map((x) => "__param__" + x.literal.text).join("")
    );
  return null;
}
const index = parse(root + "/backend/src/routes/index.ts"),
  imports = {};
for (const n of index.statements) {
  if (
    ts.isImportDeclaration(n) &&
    n.importClause &&
    n.moduleSpecifier.text.startsWith("./")
  ) {
    const file =
      root + "/backend/src/routes/" + n.moduleSpecifier.text.slice(2) + ".ts";
    if (n.importClause.name) imports[n.importClause.name.text] = file;
    for (const x of n.importClause.namedBindings?.elements || [])
      imports[x.name.text] = file;
  }
}
const server = [];
walk(index, (n) => {
  if (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === "use" &&
    text(n.arguments[0]) !== null
  ) {
    const prefix = text(n.arguments[0]);
    const file = imports[n.arguments[1]?.getText(index)];
    if (!file || !fs.existsSync(file)) return;
    const source = parse(file);
    walk(source, (r) => {
      if (
        ts.isCallExpression(r) &&
        ts.isPropertyAccessExpression(r.expression) &&
        methods.has(r.expression.name.text) &&
        text(r.arguments[0]) !== null
      ) {
        const suffix = text(r.arguments[0]);
        server.push({
          method: r.expression.name.text,
          path: (prefix + "/" + suffix)
            .replaceAll(/\/{2,}/g, "/")
            .replace(/\/$/, ""),
          file: path.relative(root, file),
        });
      }
    });
  }
});
function files(d) {
  return fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((x) =>
      x.isDirectory()
        ? files(path.join(d, x.name))
        : /\.tsx?$/.test(x.name)
          ? [path.join(d, x.name)]
          : [],
    );
}
const client = [];
for (const file of files(root + "/web/src")) {
  const source = parse(file);
  walk(source, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      methods.has(n.expression.name.text) &&
      ["api", "apiClient"].includes(n.expression.expression.getText(source))
    ) {
      const url = text(n.arguments[0]);
      if (url !== null)
        client.push({
          method: n.expression.name.text,
          path: url.split("?")[0].replace(/\/$/, ""),
          file: path.relative(root, file),
          line: source.getLineAndCharacterOfPosition(n.getStart()).line + 1,
        });
    }
  });
}
function match(a, b) {
  const r =
    "^" +
    b.path.replace(/:[^/]+/g, "[^/]+").replaceAll("__param__", "[^/]+") +
    "$";
  return a.method === b.method && new RegExp(r).test(a.path);
}
const missing = client.filter((x) => !server.some((y) => match(x, y)));
const { test } = require("node:test");
const assert = require("node:assert/strict");
test("every web API method and URL has a mounted backend handler", () => {
  assert.ok(
    client.length > 200,
    "API audit did not discover the expected call sites",
  );
  assert.equal(missing.length, 0, JSON.stringify(missing, null, 2));
});
test("API clients do not duplicate the /api base prefix", () => {
  assert.deepEqual(
    client.filter((call) => call.path.startsWith("/api/")),
    [],
  );
});
test("settings and admin routes have implemented screens", () => {
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, "web/src/App.tsx"), "utf8"),
    /<Placeholder/,
  );
});

test("static API routes cannot be swallowed by earlier parameter routes", () => {
  const shadows = server.flatMap((route, index) =>
    route.path.includes(":")
      ? []
      : server
          .slice(0, index)
          .filter(
            (previous) =>
              previous.file === route.file &&
              previous.path.includes(":") &&
              match(route, previous),
          )
          .map((previous) => ({
            route: route.path,
            shadowedBy: previous.path,
          })),
  );
  assert.deepEqual(shadows, []);
});
