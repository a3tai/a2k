import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import formatsModule from "ajv-formats";

const expectedSchemas = [
  "adapter.schema.json",
  "catalog-record.schema.json",
  "contribution.schema.json",
  "identity-policy.schema.json",
  "manifest.schema.json",
] as const;

test("all v0.1 scaffold schemas compile in strict Draft 2020-12 mode", async () => {
  const ajv = new Ajv2020({ strict: true });
  formatsModule.default(ajv);

  for (const filename of expectedSchemas) {
    const source = await readFile(
      join(process.cwd(), "schemas", "v0.1", filename),
      "utf8",
    );
    const schema = JSON.parse(source) as object;
    assert.doesNotThrow(() => ajv.compile(schema), `${filename} should compile`);
  }
});
