import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const READ_CHUNK_BYTES = 64 * 1024;

export class ManifestFileTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Manifest exceeds the ${maxBytes}-byte limit`);
    this.name = "ManifestFileTooLargeError";
  }
}

export class ManifestPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestPathError";
  }
}

export async function readManifestFile(
  path: string,
  maxBytes = 1024 * 1024,
  checkoutRoot = process.cwd(),
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  const root = await realpath(checkoutRoot);
  const candidate = isAbsolute(path) ? path : resolve(root, path);
  const candidateStat = await lstat(candidate);
  if (candidateStat.isSymbolicLink()) {
    throw new ManifestPathError("Manifest symlinks are not allowed");
  }
  if (!candidateStat.isFile()) {
    throw new ManifestPathError("Manifest must be a regular file");
  }

  const resolvedPath = await realpath(candidate);
  const relativePath = relative(root, resolvedPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  ) {
    throw new ManifestPathError("Manifest path escapes the checkout root");
  }

  const handle = await open(
    resolvedPath,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile()) {
      throw new ManifestPathError("Manifest must be a regular file");
    }

    while (total <= maxBytes) {
      const remainingProbe = maxBytes + 1 - total;
      const buffer = Buffer.allocUnsafe(
        Math.min(READ_CHUNK_BYTES, remainingProbe),
      );
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) throw new ManifestFileTooLargeError(maxBytes);
      chunks.push(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }

  return Buffer.concat(chunks, total).toString("utf8");
}
