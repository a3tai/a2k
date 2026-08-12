import type { ErrorObject } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import formatsModule from "ajv-formats";
import { parseAllDocuments } from "yaml";

import type { A2kManifest } from "@a2k/core";
import manifestSchema from "@a2k/schemas/v0.1/manifest.schema.json" with {
  type: "json",
};

const DEFAULT_MAX_BYTES = 1024 * 1024;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
});
formatsModule.default(ajv);
const validateSchema = ajv.compile<A2kManifest>(manifestSchema);

export interface ValidationError {
  code:
    | "input-too-large"
    | "yaml-document-count"
    | "yaml-invalid"
    | "schema-invalid"
    | "unsafe-content";
  path: string;
  message: string;
}

export type ValidationResult =
  | { valid: true; manifest: A2kManifest; errors: [] }
  | { valid: false; errors: ValidationError[]; manifest?: never };

export interface ValidationOptions {
  maxBytes?: number;
}

function schemaErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
  return (errors ?? []).map((error) => ({
    code: "schema-invalid",
    path: error.instancePath || "/",
    message: error.message ?? "Schema validation failed",
  }));
}

const prohibitedKey =
  /(?:^|[^a-z0-9])(access[^a-z0-9]*token|refresh[^a-z0-9]*token|api[^a-z0-9]*key|client[^a-z0-9]*secret|private[^a-z0-9]*key|password|passwd|credentials?|secrets?|tokens?|authorization)(?:$|[^a-z0-9])/i;
const prohibitedValue = /(?:^|\s)bearer\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const standaloneToken = /^(?:eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|xox[a-z]-[A-Za-z0-9-]{20,}|AIza[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,})$/;

function escapePointer(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function findUnsafeContent(value: unknown, path = ""): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof value === "string") {
    if (prohibitedValue.test(value) || standaloneToken.test(value.trim())) {
      errors.push({
        code: "unsafe-content",
        path: path || "/",
        message: "Credential-like values are not allowed in A2K manifests",
      });
    }
    try {
      const url = new URL(value);
      if (url.username || url.password) {
        errors.push({
          code: "unsafe-content",
          path: path || "/",
          message: "URI userinfo is not allowed in A2K manifests",
        });
      }
      const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const fragmentQuery = fragment.includes("?")
        ? fragment.slice(fragment.indexOf("?") + 1)
        : fragment;
      const parameterSets = [
        url.searchParams,
        new URLSearchParams(fragmentQuery),
      ];
      const hasUnsafeParameter = parameterSets.some((parameters) =>
        [...parameters.entries()].some(([key, parameterValue]) =>
          prohibitedKey.test(key) ||
          prohibitedValue.test(parameterValue) ||
          standaloneToken.test(parameterValue.trim())));
      if (hasUnsafeParameter) {
        errors.push({
          code: "unsafe-content",
          path: path || "/",
          message: "Credential-bearing URI parameters are not allowed in A2K manifests",
        });
      }
    } catch {
      // Non-URI strings are validated by their owning schema field.
    }
    return errors;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      errors.push(...findUnsafeContent(item, `${path}/${index}`));
    });
    return errors;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const itemPath = `${path}/${escapePointer(key)}`;
      if (prohibitedKey.test(key)) {
        errors.push({
          code: "unsafe-content",
          path: itemPath,
          message: "Credential-bearing fields are not allowed in A2K manifests",
        });
      }
      errors.push(...findUnsafeContent(item, itemPath));
    }
  }
  return errors;
}

export function publicValidationResult(result: ValidationResult): {
  valid: boolean;
  errors: ValidationError[];
} {
  return { valid: result.valid, errors: result.errors };
}

export function validateManifestText(
  content: string,
  options: ValidationOptions = {},
): ValidationResult {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (Buffer.byteLength(content, "utf8") > maxBytes) {
    return {
      valid: false,
      errors: [
        {
          code: "input-too-large",
          path: "/",
          message: `Manifest exceeds the ${maxBytes}-byte limit`,
        },
      ],
    };
  }

  const documents = parseAllDocuments(content, {
    customTags: [],
    resolveKnownTags: false,
    uniqueKeys: true,
    version: "1.2",
  });

  if (documents.length !== 1) {
    return {
      valid: false,
      errors: [
        {
          code: "yaml-document-count",
          path: "/",
          message: "An A2K manifest must contain exactly one YAML document",
        },
      ],
    };
  }

  const document = documents[0];
  const yamlIssues = document
    ? [...document.errors, ...document.warnings]
    : [];
  if (!document || yamlIssues.length > 0) {
    return {
      valid: false,
      errors: yamlIssues.length > 0
        ? yamlIssues.map(() => ({
            code: "yaml-invalid",
            path: "/",
            message: "YAML parsing failed",
          }))
        : [{
            code: "yaml-invalid",
            path: "/",
            message: "Invalid YAML document",
          }],
    };
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    return {
      valid: false,
      errors: [
        {
          code: "yaml-invalid",
          path: "/",
          message: error instanceof Error ? error.message : "Invalid YAML",
        },
      ],
    };
  }

  if (!validateSchema(value)) {
    return { valid: false, errors: schemaErrors(validateSchema.errors) };
  }

  const unsafeContent = findUnsafeContent(value);
  if (unsafeContent.length > 0) {
    return { valid: false, errors: unsafeContent };
  }

  return { valid: true, manifest: value as A2kManifest, errors: [] };
}

export {
  ManifestFileTooLargeError,
  ManifestPathError,
  readManifestFile,
} from "./file.js";
