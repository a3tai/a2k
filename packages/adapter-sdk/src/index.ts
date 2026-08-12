import type { A2kReference, Classification } from "@a2k/core";

export type AdapterOperation = "discover" | "read" | "propose";

export interface AdapterContext {
  actorId: string;
  classificationCeiling: Classification;
  allowedOperations: readonly AdapterOperation[];
}

export interface AdapterRecord {
  id: string;
  source: A2kReference;
  title: string;
  classification: Classification;
  revision?: string;
  digest?: `sha256:${string}`;
}

export interface A2kAdapter {
  readonly id: string;
  readonly version: string;
  readonly operations: readonly AdapterOperation[];
  discover(context: AdapterContext): Promise<readonly AdapterRecord[]>;
  read(record: AdapterRecord, context: AdapterContext): Promise<unknown>;
}
