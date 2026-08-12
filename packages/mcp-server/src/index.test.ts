import assert from "node:assert/strict";
import test from "node:test";

import { A2K_MCP_TOOLS } from "./index.js";

test("initial MCP tools are read-only and non-destructive", () => {
  assert.ok(A2K_MCP_TOOLS.length > 0);
  for (const tool of A2K_MCP_TOOLS) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  }
});

test("manifest validation accepts content rather than filesystem paths", () => {
  const validateTool = A2K_MCP_TOOLS.find(
    (tool) => tool.name === "a2k_validate_manifest",
  );

  assert.ok(validateTool);
  assert.deepEqual(validateTool.inputFields, ["content"]);
});
