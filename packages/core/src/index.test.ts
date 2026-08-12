import assert from "node:assert/strict";
import test from "node:test";

import { A2K_API_VERSION, A2K_MANIFEST_PATH } from "./index.js";

test("publishes the canonical draft bootstrap identifiers", () => {
  assert.equal(A2K_API_VERSION, "a2k.a3t.ai/v0alpha1");
  assert.equal(A2K_MANIFEST_PATH, ".a2k/manifest.yaml");
});
