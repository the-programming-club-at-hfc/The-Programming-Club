import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import ts from "typescript";

test("Cup interactions do not fall back to blocking browser dialogs", () => {
  const configPath = fileURLToPath(new URL("../tsconfig.json", import.meta.url));
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, fileURLToPath(new URL("..", import.meta.url)));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const failures: string[] = [];
  for (const source of program.getSourceFiles()) {
    // The desktop dashboard is a separate app; this gate covers Cup routes and their shared controls.
    if (source.fileName.includes("/src/components/desktop/")) continue;
    if (!source.fileName.includes("/src/components/") && !source.fileName.includes("/src/routes/hello-world/")) continue;
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
        if (ts.isIdentifier(callee) && ["alert", "confirm", "prompt"].includes(callee.text)) {
          const symbol = checker.getSymbolAtLocation(callee);
          if (symbol?.declarations?.some((declaration) => declaration.getSourceFile().fileName.endsWith("/lib.dom.d.ts"))) {
            const location = source.getLineAndCharacterOfPosition(callee.getStart(source));
            failures.push(`${source.fileName}:${location.line + 1} uses browser ${callee.text}()`);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(failures).toEqual([]);
});

test("public Cup routes render without client errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of [
    "/hello-world",
    "/hello-world/season",
    "/hello-world/rules",
    "/hello-world/cup",
    "/hello-world/join",
    "/hello-world/scores",
  ]) {
    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.ok(), path).toBe(true);
    await expect(page.locator("body")).not.toContainText('"unhandled":true');
  }
  expect(errors).toEqual([]);
});
