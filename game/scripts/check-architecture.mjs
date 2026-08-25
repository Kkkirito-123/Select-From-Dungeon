import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const repositoryRoot = path.resolve(root, "..");

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function validBoundedLines(values, maximum, maximumLength) {
  return Array.isArray(values)
    && values.length <= maximum
    && values.every((value) => (
      typeof value === "string"
      && value.length > 0
      && value.length <= maximumLength
      && !/[\r\n]/u.test(value)
    ));
}

function safeRelativeDirectory(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || path.isAbsolute(value)
    || value.replaceAll("\\", "/").split("/").includes("..")
  ) {
    throw new Error(`${label} 必须是安全的仓库相对目录`);
  }
  return value.replaceAll("\\", "/").replace(/\/$/u, "");
}

async function validateArchitectureMap() {
  const mapPath = path.join(repositoryRoot, ".maintainer", "architecture-map.json");
  const parsed = JSON.parse(await readFile(mapPath, "utf8"));
  if (
    !plainObject(parsed)
    || !exactKeys(parsed, ["schemaVersion", "projectRoot", "layers", "areas", "partitions"])
    || parsed.schemaVersion !== 2
    || parsed.projectRoot !== "game"
    || !Array.isArray(parsed.layers)
    || !Array.isArray(parsed.areas)
    || !Array.isArray(parsed.partitions)
  ) {
    throw new Error("architecture-map.json 不是受支持的 schema v2");
  }

  const layerIds = new Set();
  const layerRoots = new Map();
  for (const layer of parsed.layers) {
    if (
      !plainObject(layer)
      || !exactKeys(layer, ["id", "root", "responsibility"])
      || typeof layer.id !== "string"
      || !/^[a-z][a-z0-9-]*$/u.test(layer.id)
      || layerIds.has(layer.id)
      || typeof layer.responsibility !== "string"
      || layer.responsibility.length === 0
      || layer.responsibility.length > 120
      || /[\r\n]/u.test(layer.responsibility)
    ) {
      throw new Error("architecture-map.json 包含非法或重复 layer");
    }
    const relativeRoot = safeRelativeDirectory(layer.root, `layer ${layer.id}.root`);
    const information = await stat(path.join(repositoryRoot, relativeRoot));
    if (!information.isDirectory()) throw new Error(`layer ${layer.id} root 不是目录`);
    layerIds.add(layer.id);
    layerRoots.set(layer.id, relativeRoot);
  }

  const areaIds = new Set();
  const areaRoots = new Map();
  for (const area of parsed.areas) {
    if (
      !plainObject(area)
      || !exactKeys(area, [
        "id",
        "parentId",
        "root",
        "responsibility",
        "notResponsibleFor",
        "signals",
        "neighbors",
      ])
      || typeof area.id !== "string"
      || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(area.id)
      || areaIds.has(area.id)
      || !layerIds.has(area.parentId)
      || typeof area.responsibility !== "string"
      || area.responsibility.length === 0
      || area.responsibility.length > 120
      || /[\r\n]/u.test(area.responsibility)
      || !validBoundedLines(area.notResponsibleFor, 8, 80)
      || !validBoundedLines(area.signals, 12, 40)
      || !validBoundedLines(area.neighbors, 8, 80)
    ) {
      throw new Error("architecture-map.json 包含非法或重复 area");
    }
    const relativeRoot = safeRelativeDirectory(area.root, `area ${area.id}.root`);
    const parentRoot = layerRoots.get(area.parentId);
    if (!parentRoot || path.posix.dirname(relativeRoot) !== parentRoot) {
      throw new Error(`area ${area.id} 必须是所属 layer 的直接职责目录`);
    }
    const information = await stat(path.join(repositoryRoot, relativeRoot));
    if (!information.isDirectory()) throw new Error(`area ${area.id} root 不是目录`);
    areaIds.add(area.id);
    areaRoots.set(relativeRoot, area.id);
  }

  for (const area of parsed.areas) {
    if (area.neighbors.some((neighbor) => neighbor === area.id || !areaIds.has(neighbor))) {
      throw new Error(`area ${area.id} 包含无效相邻区域`);
    }
  }

  const partitionIds = new Set();
  const partitionRoots = new Set();
  for (const partition of parsed.partitions) {
    if (
      !plainObject(partition)
      || !exactKeys(partition, [
        "id",
        "parentId",
        "root",
        "responsibility",
        "notResponsibleFor",
        "signals",
        "neighbors",
      ])
      || typeof partition.id !== "string"
      || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$/u.test(partition.id)
      || partitionIds.has(partition.id)
      || !areaIds.has(partition.parentId)
      || typeof partition.responsibility !== "string"
      || partition.responsibility.length === 0
      || partition.responsibility.length > 120
      || /[\r\n]/u.test(partition.responsibility)
      || !validBoundedLines(partition.notResponsibleFor, 8, 80)
      || !validBoundedLines(partition.signals, 12, 40)
      || !validBoundedLines(partition.neighbors, 8, 80)
    ) {
      throw new Error("architecture-map.json 包含非法或重复 partition");
    }
    const relativeRoot = safeRelativeDirectory(
      partition.root,
      `partition ${partition.id}.root`,
    );
    const parentRoot = [...areaRoots.entries()].find(([, id]) => id === partition.parentId)?.[0];
    const relativeToParent = parentRoot
      ? path.posix.relative(parentRoot, relativeRoot)
      : "";
    if (
      !parentRoot
      || !relativeToParent
      || relativeToParent === ".."
      || relativeToParent.startsWith("../")
      || partitionRoots.has(relativeRoot)
    ) {
      throw new Error(`partition ${partition.id} root 必须唯一且位于所属 area 内`);
    }
    const information = await stat(path.join(repositoryRoot, relativeRoot));
    if (!information.isDirectory()) throw new Error(`partition ${partition.id} root 不是目录`);
    partitionIds.add(partition.id);
    partitionRoots.add(relativeRoot);
  }

  for (const partition of parsed.partitions) {
    if (
      partition.neighbors.some((neighbor) => (
        neighbor === partition.id || !partitionIds.has(neighbor)
      ))
    ) {
      throw new Error(`partition ${partition.id} 包含无效相邻分区`);
    }
  }

  for (const [layerId, layerRoot] of layerRoots) {
    const entries = await readdir(path.join(repositoryRoot, layerRoot), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childRoot = `${layerRoot}/${entry.name}`;
      if (!areaRoots.has(childRoot)) {
        throw new Error(`layer ${layerId} 出现未登记职责区域：${childRoot}`);
      }
    }
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(relative));
    } else if (entry.isFile() && relative.endsWith(".ts")) {
      files.push(relative);
    }
  }
  return files;
}

const rules = [
  {
    directory: "src/domain",
    forbidden: ["presentation", "infrastructure"],
    message: "domain 不能反向依赖 presentation 或 infrastructure",
  },
  {
    directory: "src/content",
    forbidden: ["infrastructure"],
    message: "content 不能依赖 infrastructure",
  },
];

const violations = [];
try {
  await validateArchitectureMap();
} catch (error) {
  violations.push(error instanceof Error ? error.message : "架构地图校验失败");
}
for (const rule of rules) {
  for (const file of await sourceFiles(rule.directory)) {
    const text = await readFile(path.join(root, file), "utf8");
    const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)];
    for (const [, specifier] of imports) {
      if (!rule.forbidden.some((segment) => specifier.includes(segment))) continue;
      violations.push(`${file}: ${specifier}（${rule.message}）`);
    }
  }
}

if (violations.length > 0) {
  console.error("架构依赖检查失败：");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log("架构依赖检查通过：区域职责地图与 domain/content 依赖边界有效。");
}
