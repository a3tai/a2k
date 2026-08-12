export const A2K_API_VERSION = "a2k.a3t.ai/v0alpha1" as const;
export const A2K_MANIFEST_PATH = ".a2k/manifest.yaml" as const;

export type A2kKind =
  | "OrganizationHub"
  | "PrivateOverlay"
  | "ProjectBootstrap";

export type Classification =
  | "public"
  | "internal"
  | "confidential"
  | "restricted";

export type A2kProfile =
  | "core"
  | "governance"
  | "bootstrap"
  | "mcp"
  | "identity"
  | "knowledge-adapters"
  | "a2a"
  | "acp"
  | "agent-skills"
  | `x-${string}`;

export interface A2kRoot {
  id: string;
  path: string;
  classification: Classification;
  kinds?: string[];
}

export interface A2kReference {
  id: string;
  type:
    | "documentation"
    | "catalog"
    | "knowledge-base"
    | "schema"
    | "tooling"
    | "research";
  uri: string;
  revision?: string;
  digest?: `sha256:${string}`;
  classification: Classification;
}

export interface A2kManifest {
  $schema?: string;
  apiVersion: typeof A2K_API_VERSION;
  kind: A2kKind;
  metadata: {
    id: string;
    name: string;
    title?: string;
    owners: string[];
    classification: Classification;
  };
  spec: {
    roots: A2kRoot[];
    references?: A2kReference[];
    profiles: A2kProfile[];
    policy: {
      remoteFetch: "disabled" | "allowlisted";
      mutation: "deny" | "proposal" | "approval-required";
    };
    overlay?: {
      baseId: string;
      baseDigest: `sha256:${string}`;
      baseRevision?: string;
    };
  };
}
