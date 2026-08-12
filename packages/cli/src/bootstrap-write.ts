import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { BootstrapPlan } from "@a2k/bootstrap";

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function assertContained(root: string, path: string, label: string): void {
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`${label} escapes the project: ${path}`);
  }
}

async function prepareSafeParent(root: string, destination: string): Promise<void> {
  const parent = dirname(destination);
  const fromRoot = relative(root, parent);
  const segments = fromRoot === "" ? [] : fromRoot.split(sep);
  let current = root;

  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Bootstrap destination parent is a symlink: ${current}`);
      }
      if (!stat.isDirectory()) {
        throw new Error(`Bootstrap destination parent is not a directory: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current);
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`Bootstrap destination parent is unsafe: ${current}`);
      }
    }
  }

  const canonicalParent = await realpath(parent);
  assertContained(root, canonicalParent, "Bootstrap destination parent");
}

export async function writeBootstrapPlan(
  root: string,
  plan: BootstrapPlan,
  approvedDigest: string,
): Promise<string[]> {
  if (approvedDigest !== plan.approvalDigest) {
    throw new Error("Approval digest does not match the reviewed plan");
  }

  const projectRoot = await realpath(root);
  const destinations = plan.changes.map((change) => {
    const destination = resolve(projectRoot, change.path);
    assertContained(projectRoot, destination, "Bootstrap path");
    return destination;
  });

  if (new Set(destinations).size !== destinations.length) {
    throw new Error("Bootstrap plan contains duplicate destinations");
  }
  for (const destination of destinations) {
    if (await pathExists(destination)) {
      throw new Error(`Bootstrap destination already exists: ${destination}`);
    }
    await prepareSafeParent(projectRoot, destination);
  }

  for (const [index, change] of plan.changes.entries()) {
    const destination = destinations[index];
    if (!destination) throw new Error("Bootstrap plan destination is missing");
    await prepareSafeParent(projectRoot, destination);
    const handle = await open(
      destination,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      await handle.writeFile(change.content, "utf8");
    } finally {
      await handle.close();
    }
  }
  return destinations;
}
