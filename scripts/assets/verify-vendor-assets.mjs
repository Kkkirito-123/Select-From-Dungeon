import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const vendorRoot = resolve(repoRoot, "assets", "vendor");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveInside(root, path) {
  if (isAbsolute(path)) throw new Error(`Absolute manifest path: ${path}`);
  const resolved = resolve(root, path);
  const distance = relative(root, resolved);
  if (distance.startsWith("..") || isAbsolute(distance)) {
    throw new Error(`Manifest path escapes source directory: ${path}`);
  }
  return resolved;
}

function pngDimensions(bytes) {
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature) return null;
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

async function verifyFile(sourceDir, record) {
  const filePath = resolveInside(sourceDir, record.path);
  const bytes = await readFile(filePath);
  const actual = {
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };

  if (actual.bytes !== record.bytes) {
    throw new Error(
      `${record.path}: expected ${record.bytes} bytes, got ${actual.bytes}`,
    );
  }
  if (actual.sha256 !== record.sha256) {
    throw new Error(
      `${record.path}: expected sha256 ${record.sha256}, got ${actual.sha256}`,
    );
  }

  if (record.dimensions) {
    const dimensions = pngDimensions(bytes);
    if (dimensions !== record.dimensions) {
      throw new Error(
        `${record.path}: expected ${record.dimensions}, got ${dimensions ?? "non-PNG"}`,
      );
    }
  }
}

const entries = await readdir(vendorRoot, { withFileTypes: true });
const sourceIds = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let verifiedFiles = 0;
for (const id of sourceIds) {
  const sourceDir = resolve(vendorRoot, id);
  const source = JSON.parse(
    await readFile(resolve(sourceDir, "source.json"), "utf8"),
  );

  if (source.id !== id) {
    throw new Error(`${id}: source.json id is ${source.id}`);
  }
  if (source.license?.spdx !== "CC0-1.0") {
    throw new Error(`${id}: expected CC0-1.0 license record`);
  }
  if (!source.canonicalUrl?.startsWith("https://")) {
    throw new Error(`${id}: canonical URL must be HTTPS`);
  }

  const legalCodePath = resolveInside(sourceDir, source.license.legalCodePath);
  const legalCode = await readFile(legalCodePath);
  if (sha256(legalCode) !== source.license.legalCodeSha256) {
    throw new Error(`${id}: legal-code hash does not match source.json`);
  }

  const records = [
    ...(source.archives ?? []),
    ...(source.selectedFiles ?? []),
    ...(source.derivedFiles ?? []),
  ];
  for (const record of records) {
    await verifyFile(sourceDir, record);
    verifiedFiles += 1;
  }

  for (const archive of source.archives ?? []) {
    const publicCopy = resolve(repoRoot, "public", archive.path.split("/").at(-1));
    await stat(publicCopy)
      .then(() => {
        throw new Error(
          `${id}: original archive must not be copied into public (${publicCopy})`,
        );
      })
      .catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
  }

  console.log(
    `✓ ${id}: ${source.archives.length} archive(s), ${source.selectedFiles.length} selected file(s)`,
  );
}

console.log(
  `Verified ${sourceIds.length} CC0 source(s) and ${verifiedFiles} recorded file(s).`,
);
