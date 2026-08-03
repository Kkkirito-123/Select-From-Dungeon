/** 校验运行时素材清单、哈希和文件存在性，防止发布缺失或篡改资源。 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicAssetsRoot = resolve(repoRoot, "public", "assets");
const sourceManifestPath = resolve(repoRoot, "assets", "manifest.json");
const runtimeManifestPath = resolve(publicAssetsRoot, "manifest.json");
const forbiddenRuntimeExtensions = new Set([
  ".ase",
  ".aseprite",
  ".mid",
  ".midi",
  ".mp3",
  ".ogg",
  ".psd",
  ".sf2",
  ".sfz",
  ".wav",
  ".zip",
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

const errors = [];
const sourceManifest = await readJson(sourceManifestPath);
const sourceRecords = new Map();
for (const source of sourceManifest.sources ?? []) {
  const sourcePath = resolve(repoRoot, "assets", source.sourceRecord);
  const record = await readJson(sourcePath);
  sourceRecords.set(source.id, record);
  if (record.id !== source.id) errors.push(`${source.id}: source record id mismatch`);
  if (record.license?.spdx !== source.license) {
    errors.push(`${source.id}: expected ${source.license}, got ${record.license?.spdx ?? "missing"}`);
  }
}

const runtimeManifest = await readJson(runtimeManifestPath);
const declaredRuntimeImages = new Set();
let compressedBytes = 0;

for (const packIndex of runtimeManifest.floorPacks ?? []) {
  const packManifestPath = resolve(publicAssetsRoot, packIndex.manifest);
  const pack = await readJson(packManifestPath);
  const packDir = dirname(packManifestPath);
  const packSourceIds = new Set((pack.sources ?? []).map((source) => source.id));
  for (const sourceId of packSourceIds) {
    if (!sourceRecords.has(sourceId)) errors.push(`${pack.id}: unknown source ${sourceId}`);
  }

  let packBytes = 0;
  for (const texture of pack.textures ?? []) {
    const runtimePath = resolve(packDir, texture.runtimePath);
    const sourcePath = resolve(repoRoot, texture.sourcePath);
    declaredRuntimeImages.add(runtimePath);
    const [runtimeStat, sourceStat, runtimeHash, sourceHash] = await Promise.all([
      stat(runtimePath),
      stat(sourcePath),
      sha256(runtimePath),
      sha256(sourcePath),
    ]);
    packBytes += runtimeStat.size;
    if (runtimeStat.size !== texture.bytes || sourceStat.size !== texture.bytes) {
      errors.push(`${texture.key}: byte count differs from manifest`);
    }
    if (runtimeHash !== texture.sha256 || sourceHash !== texture.sha256) {
      errors.push(`${texture.key}: SHA-256 differs from selected source or manifest`);
    }
  }
  compressedBytes += packBytes;
  if (packBytes !== pack.compressedBytes || packBytes !== packIndex.compressedBytes) {
    errors.push(`${pack.id}: compressed byte total mismatch`);
  }
}

const runtimeFiles = await walk(resolve(publicAssetsRoot, "floors"));
for (const path of runtimeFiles) {
  const extension = extname(path).toLowerCase();
  if (forbiddenRuntimeExtensions.has(extension)) {
    errors.push(`${path}: forbidden runtime source or audio format`);
  }
  if (extension === ".png" && !declaredRuntimeImages.has(path)) {
    errors.push(`${path}: orphan runtime image`);
  }
}

if (errors.length > 0) {
  errors.forEach((error) => console.error(`ERROR ${error}`));
  process.exitCode = 1;
} else {
  console.log(
    `Runtime assets verified: ${sourceRecords.size} CC0 sources, ` +
    `${declaredRuntimeImages.size} images, ${compressedBytes} compressed bytes.`,
  );
}
