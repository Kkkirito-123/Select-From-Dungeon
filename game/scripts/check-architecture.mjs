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
    || !exactKeys(parsed, [
      "schemaVersion",
      "projectRoot",
      "layers",
      "areas",
      "partitions",
      "floorScopes",
    ])
    || parsed.schemaVersion !== 3
    || parsed.projectRoot !== "game"
    || !Array.isArray(parsed.layers)
    || !Array.isArray(parsed.areas)
    || !Array.isArray(parsed.partitions)
    || !Array.isArray(parsed.floorScopes)
  ) {
    throw new Error("architecture-map.json 不是受支持的 schema v3");
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

  const floorScopeIds = new Set();
  const floorNumbers = new Set();
  const floorRoots = new Set();
  for (const floorScope of parsed.floorScopes) {
    if (
      !plainObject(floorScope)
      || !exactKeys(floorScope, [
        "id",
        "floor",
        "roots",
        "responsibility",
        "signals",
        "neighbors",
        "sharedPartitions",
      ])
      || typeof floorScope.id !== "string"
      || !/^floor\.(?:0[1-8])$/u.test(floorScope.id)
      || !Number.isInteger(floorScope.floor)
      || floorScope.floor < 1
      || floorScope.floor > 8
      || floorScope.id !== `floor.${String(floorScope.floor).padStart(2, "0")}`
      || floorScopeIds.has(floorScope.id)
      || floorNumbers.has(floorScope.floor)
      || typeof floorScope.responsibility !== "string"
      || floorScope.responsibility.length === 0
      || floorScope.responsibility.length > 120
      || /[\r\n]/u.test(floorScope.responsibility)
      || !validBoundedLines(floorScope.roots, 8, 200)
      || floorScope.roots.length === 0
      || !validBoundedLines(floorScope.signals, 12, 40)
      || !validBoundedLines(floorScope.neighbors, 2, 80)
      || !validBoundedLines(floorScope.sharedPartitions, 8, 80)
    ) {
      throw new Error("architecture-map.json 包含非法或重复 floor scope");
    }
    for (const rawRoot of floorScope.roots) {
      const relativeRoot = safeRelativeDirectory(
        rawRoot,
        `floor scope ${floorScope.id}.roots`,
      );
      const expectedSuffix = `/floors/floor${String(floorScope.floor).padStart(2, "0")}`;
      if (
        !relativeRoot.startsWith(`${parsed.projectRoot}/`)
        || !relativeRoot.endsWith(expectedSuffix)
        || floorRoots.has(relativeRoot)
      ) {
        throw new Error(`floor scope ${floorScope.id} root 必须唯一并对应同编号稳定楼层目录`);
      }
      const information = await stat(path.join(repositoryRoot, relativeRoot));
      if (!information.isDirectory()) {
        throw new Error(`floor scope ${floorScope.id} root 不是目录`);
      }
      floorRoots.add(relativeRoot);
    }
    floorScopeIds.add(floorScope.id);
    floorNumbers.add(floorScope.floor);
  }
  if (floorScopeIds.size !== 8) {
    throw new Error("architecture-map.json 必须登记完整八层 floor scope");
  }
  for (const floorScope of parsed.floorScopes) {
    const expectedNeighbors = [floorScope.floor - 1, floorScope.floor + 1]
      .filter((floor) => floor >= 1 && floor <= 8)
      .map((floor) => `floor.${String(floor).padStart(2, "0")}`)
      .sort();
    if (
      [...floorScope.neighbors].sort().join("\n") !== expectedNeighbors.join("\n")
      || floorScope.neighbors.some((neighbor) => !floorScopeIds.has(neighbor))
    ) {
      throw new Error(`floor scope ${floorScope.id} 只能引用直接相邻楼层`);
    }
    if (
      floorScope.sharedPartitions.length === 0
      || floorScope.sharedPartitions.some((partition) => !partitionIds.has(partition))
    ) {
      throw new Error(`floor scope ${floorScope.id} 必须引用有效父级共享 partition`);
    }
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
    forbidden: ["application", "presentation", "infrastructure", "devtools"],
    message: "domain 只能单向消费 contracts/content/domain，不能反向依赖外层",
  },
  {
    directory: "src/content",
    forbidden: ["application", "infrastructure", "presentation", "devtools"],
    message: "content 只能消费父级 contracts 与静态内容/类型",
  },
  {
    directory: "src/infrastructure",
    forbidden: ["application", "presentation", "devtools"],
    message: "infrastructure 不得反向依赖应用装配或表现层",
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

for (const file of await sourceFiles("src")) {
  const normalizedFile = file.replaceAll("\\", "/");
  const sourceFloor = /\/floors\/floor(0[1-8])\//u.exec(normalizedFile)?.[1] ?? null;
  const isFloorRegistry = (
    /\/floors\/(?:index|registry|landmarkRegistry)\.ts$/u.test(normalizedFile)
    || /\/content\/world\/(?:biomeContent|floorMapBlueprints)\.ts$/u.test(normalizedFile)
    || /\/content\/world\/floorExperience\/index\.ts$/u.test(normalizedFile)
  );
  const text = await readFile(path.join(root, file), "utf8");
  const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)];
  for (const [, specifier] of imports) {
    const targetFloor = /(?:^|\/)floor(0[1-8])(?:\/|$)/u.exec(specifier)?.[1] ?? null;
    if (!targetFloor) continue;
    if (sourceFloor && sourceFloor === targetFloor) continue;
    if (!sourceFloor && isFloorRegistry) continue;
    violations.push(
      `${file}: ${specifier}（楼层子单元不得引用兄弟楼层；共同逻辑必须上提 shared，由 registry 装配）`,
    );
  }
}

if (violations.length > 0) {
  console.error("架构依赖检查失败：");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log("架构依赖检查通过：区域职责地图与 domain/content 依赖边界有效。");
}
