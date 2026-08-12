export interface A2kMcpToolContract {
  name: string;
  title: string;
  description: string;
  inputFields: readonly string[];
  annotations: {
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: true;
    openWorldHint: false;
  };
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const A2K_MCP_TOOLS: readonly A2kMcpToolContract[] = [
  {
    name: "a2k_validate_manifest",
    title: "Validate an A2K manifest",
    description:
      "Validate supplied YAML content without reading files, following references, or applying changes.",
    inputFields: ["content"],
    annotations: readOnlyAnnotations,
  },
  {
    name: "a2k_describe_profiles",
    title: "Describe A2K profiles",
    description:
      "Return supported profile identifiers and their specification locations.",
    inputFields: [],
    annotations: readOnlyAnnotations,
  },
] as const;
