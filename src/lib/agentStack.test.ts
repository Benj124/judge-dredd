import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("agent-usable stack and human README", () => {
  it("keeps managed Next agent markers and adds project guidance outside them", () => {
    const agents = read("AGENTS.md");
    const start = "<!-- BEGIN:nextjs-agent-rules -->";
    const end = "<!-- END:nextjs-agent-rules -->";
    assert.ok(agents.includes(start), "AGENTS.md must keep managed start marker");
    assert.ok(agents.includes(end), "AGENTS.md must keep managed end marker");

    const after = agents.slice(agents.indexOf(end) + end.length);
    assert.match(after, /Judge Dredd/);
    assert.match(after, /src\/lib\/eval/);
    assert.match(after, /src\/lib\/db/);
    assert.match(after, /src\/lib\/rag/);
    assert.match(after, /src\/app/);
    assert.match(after, /npm test/);
    assert.match(after, /node_modules\/next\/dist\/docs/);

    const claude = read("CLAUDE.md").trim();
    assert.equal(claude, "@AGENTS.md");
  });

  it("configures next-devtools-mcp for local agent attach", () => {
    const mcpPath = join(root, ".mcp.json");
    assert.ok(existsSync(mcpPath), ".mcp.json must exist");
    const mcp = JSON.parse(read(".mcp.json")) as {
      mcpServers?: Record<string, { command?: string; args?: string[] }>;
    };
    const servers = mcp.mcpServers ?? {};
    const nextDevtools = Object.values(servers).find((server) =>
      (server.args ?? []).some((arg) => arg.includes("next-devtools-mcp")),
    );
    assert.ok(nextDevtools, "mcpServers must include next-devtools-mcp");
    assert.equal(nextDevtools?.command, "npx");
  });

  it("stays on Next 16.3+ agent line with matching eslint-config-next", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const nextVersion = pkg.dependencies.next.replace(/^[\^~]/, "");
    const eslintNext = pkg.devDependencies["eslint-config-next"].replace(
      /^[\^~]/,
      "",
    );
    const [maj, min] = nextVersion.split(".").map(Number);
    assert.ok(
      maj > 16 || (maj === 16 && min >= 3),
      `next must be >= 16.3, got ${pkg.dependencies.next}`,
    );
    assert.equal(
      nextVersion,
      eslintNext,
      "eslint-config-next version should match next",
    );
  });

  it("README documents useful scripts that exist in package.json", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const readme = read("README.md");

    assert.match(readme, /Judge Dredd/);
    assert.match(readme, /npm install/);
    assert.match(readme, /npm run dev/);

    const required = [
      "dev",
      "build",
      "start",
      "lint",
      "test",
      "db:up",
      "db:migrate",
      "db:smoke",
      "eval:questions",
      "rag:query",
      "rag:ground",
      "etl:eval-data",
    ];

    for (const name of required) {
      assert.ok(
        pkg.scripts[name],
        `package.json scripts missing "${name}"`,
      );
      // README documents via `npm run <name>` or `npm test` for the test script.
      if (name === "test") {
        assert.match(
          readme,
          /npm test|npm run test\b/,
          "README must document npm test",
        );
      } else {
        assert.ok(
          readme.includes(`npm run ${name}`),
          `README must document npm run ${name}`,
        );
      }
    }
  });
});
