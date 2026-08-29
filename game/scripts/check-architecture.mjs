import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  extractModuleSpecifiers,
  isFloorAggregatorPath,
  resolveModuleSpecifier,
  targetFloorNumber,
} from "./architecture-imports.mjs";

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

/** 计算架构 feature 对公开题干的确定性信号分数。 */
function featureSignalScore(feature, prompt) {
  const normalized = String(prompt).toLocaleLowerCase("zh-CN").replace(/\s+/gu, " ").trim();
  if (feature.negativeSignals.some((signal) => normalized.includes(signal.toLocaleLowerCase("zh-CN")))) {
    return Number.NEGATIVE_INFINITY;
  }
  return feature.signals.reduce((score, signal) => (
    normalized.includes(signal.toLocaleLowerCase("zh-CN"))
      ? score + signal.length
      : score
  ), 0);
}

/** 校验游戏拥有的隐藏 Benchmark 路由合同，不输出隐藏字段。 */
async function validateBenchmarkRouteContract(parsed) {
  const benchmarkRoot = path.join(repositoryRoot, "benchmark", "agent-evals");
  let directoryEntries;
  try {
    directoryEntries = await readdir(benchmarkRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  const entries = directoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const features = new Map(parsed.features.map((feature) => [feature.id, feature]));
  for (const fixtureId of entries) {
    const caseValue = JSON.parse(await readFile(
      path.join(benchmarkRoot, fixtureId, "case.json"),
      "utf8",
    ));
    const expected = JSON.parse(await readFile(
      path.join(benchmarkRoot, fixtureId, "expected.json"),
      "utf8",
    ));
    if (
      !plainObject(caseValue)
      || caseValue.fixtureId !== fixtureId
      || !plainObject(expected)
      || expected.fixtureId !== fixtureId
      || expected.schemaVersion !== 3
      || !Array.isArray(expected.expectedRouteFeatures)
      || expected.expectedRouteFeatures.length === 0
    ) {
      throw new Error(`Benchmark ${fixtureId} 必须使用 expected schema v3 路由合同`);
    }
    const expectedFeatures = expected.expectedRouteFeatures.map((featureId) => features.get(featureId));
    if (expectedFeatures.some((feature) => !feature)) {
      throw new Error(`Benchmark ${fixtureId} 声明了未知 expectedRouteFeatures`);
    }
    const ranked = parsed.features
      .map((feature) => ({ feature, score: featureSignalScore(feature, caseValue.prompt) }))
      .sort((left, right) => right.score - left.score);
    const bestScore = ranked[0]?.score ?? 0;
    if (bestScore <= 0 || expectedFeatures.some((feature) => (
      featureSignalScore(feature, caseValue.prompt) !== bestScore
    ))) {
      throw new Error(`Benchmark ${fixtureId} 的公开题干未稳定命中声明 feature`);
    }
  }
}

async function validateArchitectureMap() {
  const mapPath = path.join(repositoryRoot, ".maintainer", "architecture-map.json");
  const parsed = JSON.parse(await readFile(mapPath, "utf8"));
  if (
    !plainObject(parsed)
    || !exactKeys(parsed, [
      "schemaVersion",
      "contractId",
      "contractVersion",
      "projectRoot",
      "boundaryRevision",
      "layers",
      "areas",
      "partitions",
      "floorScopes",
      "features",
      "runtime",
      "maintenancePolicy",
      "boundary",
    ])
    || parsed.schemaVersion !== 4
    || parsed.contractId !== "dungeon.game.architecture"
    || parsed.contractVersion !== 1
    || parsed.projectRoot !== "game"
    || !Number.isInteger(parsed.boundaryRevision)
    || parsed.boundaryRevision < 1
    || !Array.isArray(parsed.layers)
    || !Array.isArray(parsed.areas)
    || !Array.isArray(parsed.partitions)
    || !Array.isArray(parsed.floorScopes)
    || !Array.isArray(parsed.features)
  ) {
    throw new Error("architecture-map.json 不是受支持的 schema v4");
  }

  if (
    !plainObject(parsed.runtime)
    || !exactKeys(parsed.runtime, [
      "sourceRoot",
      "bridgeProtocol",
      "adapterVersion",
      "supportedCapabilities",
    ])
    || parsed.runtime.sourceRoot !== parsed.projectRoot
    || parsed.runtime.bridgeProtocol !== 3
    || parsed.runtime.adapterVersion !== 2
    || !validBoundedLines(parsed.runtime.supportedCapabilities, 16, 60)
    || !["catalog", "describe", "materialize"].every((capability) => (
      parsed.runtime.supportedCapabilities.includes(capability)
    ))
  ) {
    throw new Error("architecture-map.json runtime 契约非法");
  }
  if (
    !plainObject(parsed.maintenancePolicy)
    || !exactKeys(parsed.maintenancePolicy, [
      "ordinaryFile",
      "internalDirectory",
      "rootMoveOrRename",
      "areaPartitionChange",
      "responsibilityOrRouteChange",
      "invalidCore",
    ])
    || parsed.maintenancePolicy.ordinaryFile !== "no-update"
    || parsed.maintenancePolicy.internalDirectory !== "no-update"
    || parsed.maintenancePolicy.rootMoveOrRename !== "update"
    || parsed.maintenancePolicy.areaPartitionChange !== "update"
    || parsed.maintenancePolicy.responsibilityOrRouteChange !== "update"
    || parsed.maintenancePolicy.invalidCore !== "fallback"
  ) {
    throw new Error("architecture-map.json maintenancePolicy 非法");
  }
  if (
    !plainObject(parsed.boundary)
    || !exactKeys(parsed.boundary, ["algorithm", "signature"])
    || parsed.boundary.algorithm !== "direct-child-v1"
    || typeof parsed.boundary.signature !== "string"
    || !/^[a-f0-9]{64}$/u.test(parsed.boundary.signature)
  ) {
    throw new Error("architecture-map.json boundary 非法");
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
        "contentRefs",
        "serviceRefs",
        "featureRefs",
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
      || !validBoundedLines(floorScope.contentRefs, 12, 100)
      || !validBoundedLines(floorScope.serviceRefs, 12, 100)
      || !validBoundedLines(floorScope.featureRefs, 12, 100)
    ) {
      throw new Error("architecture-map.json 包含非法或重复 floor scope");
    }
    for (const rawRoot of floorScope.roots) {
      const relativeRoot = safeRelativeDirectory(
        rawRoot,
        `floor scope ${floorScope.id}.roots`,
      );
      const expectedSuffix = `/floors/floor${String(floorScope.floor).padStart(2, "0")}`;
      const owningArea = [...areaRoots.entries()].find(([areaRoot]) => (
        relativeRoot.startsWith(`${areaRoot}/`)
      ));
      if (
        !relativeRoot.startsWith(`${parsed.projectRoot}/`)
        || !relativeRoot.endsWith(expectedSuffix)
        || !owningArea
        || floorRoots.has(relativeRoot)
      ) {
        throw new Error(`floor scope ${floorScope.id} root 必须唯一、位于已登记 area 并对应同编号稳定楼层目录`);
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

  const stableAreaReferences = new Set([...areaIds, ...partitionIds]);
  const stableReferences = new Set([...stableAreaReferences, ...floorScopeIds]);
  const featureIds = new Set();
  for (const feature of parsed.features) {
    if (
      !plainObject(feature)
      || !exactKeys(feature, [
        "id",
        "roots",
        "responsibility",
        "notResponsibleFor",
        "signals",
        "negativeSignals",
        "neighbors",
        "route",
        "contentRefs",
        "serviceProviders",
      ])
      || typeof feature.id !== "string"
      || !/^feature\.[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/u.test(feature.id)
      || featureIds.has(feature.id)
      || typeof feature.responsibility !== "string"
      || feature.responsibility.length === 0
      || feature.responsibility.length > 160
      || /[\r\n]/u.test(feature.responsibility)
      || !validBoundedLines(feature.roots, 12, 100)
      || feature.roots.length === 0
      || !validBoundedLines(feature.notResponsibleFor, 8, 80)
      || !validBoundedLines(feature.signals, 16, 60)
      || feature.signals.length === 0
      || !validBoundedLines(feature.negativeSignals, 8, 60)
      || !validBoundedLines(feature.neighbors, 8, 100)
      || !validBoundedLines(feature.contentRefs, 8, 100)
      || !validBoundedLines(feature.serviceProviders, 8, 100)
      || !plainObject(feature.route)
      || !exactKeys(feature.route, ["primary", "adjacent", "shared", "fallback"])
      || !validBoundedLines(feature.route.primary, 8, 100)
      || feature.route.primary.length === 0
      || !validBoundedLines(feature.route.adjacent, 8, 100)
      || !validBoundedLines(feature.route.shared, 8, 100)
      || !validBoundedLines(feature.route.fallback, 8, 100)
    ) {
      throw new Error("architecture-map.json 包含非法或重复 feature");
    }
    const routeReferences = [
      ...feature.route.primary,
      ...feature.route.adjacent,
      ...feature.route.shared,
      ...feature.route.fallback,
    ];
    if (
      new Set(feature.roots).size !== feature.roots.length
      || feature.roots.some((reference) => !stableReferences.has(reference))
      || new Set(routeReferences).size !== routeReferences.length
      || routeReferences.some((reference) => !feature.roots.includes(reference))
      || feature.neighbors.some((reference) => !stableReferences.has(reference))
      || feature.contentRefs.some((reference) => !stableAreaReferences.has(reference))
      || feature.serviceProviders.some((reference) => !stableAreaReferences.has(reference))
    ) {
      throw new Error(`feature ${feature.id} 包含未知、重复或越界稳定引用`);
    }
    featureIds.add(feature.id);
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
    if (
      floorScope.contentRefs.some((reference) => !stableAreaReferences.has(reference))
      || floorScope.serviceRefs.some((reference) => !stableAreaReferences.has(reference))
      || floorScope.featureRefs.some((reference) => !featureIds.has(reference))
    ) {
      throw new Error(`floor scope ${floorScope.id} 包含未知内容、服务或功能引用`);
    }
    for (const sharedPartitionId of floorScope.sharedPartitions) {
      const sharedRoot = parsed.partitions.find((partition) => (
        partition.id === sharedPartitionId
      ))?.root;
      if (sharedRoot && floorScope.roots.some((floorRoot) => (
        floorRoot === sharedRoot
        || floorRoot.startsWith(`${sharedRoot}/`)
        || sharedRoot.startsWith(`${floorRoot}/`)
      ))) {
        throw new Error(`floor scope ${floorScope.id} 与 shared partition 目录不能重叠`);
      }
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

  await validateBenchmarkRouteContract(parsed);

  const directChildren = [];
  for (const [layerId, layerRoot] of layerRoots) {
    const entries = await readdir(path.join(repositoryRoot, layerRoot), { withFileTypes: true });
    const childNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    directChildren.push({ layerId, children: childNames });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childRoot = `${layerRoot}/${entry.name}`;
      if (!areaRoots.has(childRoot)) {
        throw new Error(`layer ${layerId} 出现未登记职责区域：${childRoot}`);
      }
    }
  }

  // 签名只覆盖稳定边界、职责和路由。普通文件以及 area/partition 内部子目录不参与，
  // 因而频繁实现修改不要求维护地图；稳定 root 或职责变化则必须显式递增 revision。
  const boundaryPayload = {
    layers: parsed.layers.map(({ id, root, responsibility }) => ({ id, root, responsibility })),
    areas: parsed.areas.map(({ id, parentId, root, responsibility }) => ({
      id,
      parentId,
      root,
      responsibility,
    })),
    partitions: parsed.partitions.map(({ id, parentId, root, responsibility }) => ({
      id,
      parentId,
      root,
      responsibility,
    })),
    floorScopes: parsed.floorScopes.map((floorScope) => ({
      id: floorScope.id,
      roots: floorScope.roots,
      responsibility: floorScope.responsibility,
      neighbors: floorScope.neighbors,
      sharedPartitions: floorScope.sharedPartitions,
      contentRefs: floorScope.contentRefs,
      serviceRefs: floorScope.serviceRefs,
      featureRefs: floorScope.featureRefs,
    })),
    features: parsed.features.map((feature) => ({
      id: feature.id,
      roots: feature.roots,
      responsibility: feature.responsibility,
      route: feature.route,
      contentRefs: feature.contentRefs,
      serviceProviders: feature.serviceProviders,
    })),
    runtime: parsed.runtime,
    directChildren,
  };
  const actualSignature = createHash("sha256")
    .update(JSON.stringify(boundaryPayload))
    .digest("hex");
  if (process.argv.includes("--print-boundary")) {
    console.log(actualSignature);
  } else if (actualSignature !== parsed.boundary.signature) {
    throw new Error(
      `architecture-map.json 边界签名不匹配；稳定边界变化时更新为 ${actualSignature}`,
    );
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

// 功能包之间只允许沿“下层服务 -> 门面/协调器 -> 运行时”的方向连接。
// 这里约束的是功能包边，不限制包内部对 contracts/content/domain/infrastructure
// 的正常依赖；具体适配器仍由各层自己的规则校验。
const FEATURE_DEPENDENCIES = new Map([
  ["game-session", new Set()],
  ["terminal", new Set()],
  ["narrative", new Set()],
  ["snapshot", new Set()],
  ["app-shell", new Set(["game-session", "terminal", "narrative", "snapshot"])],
  ["game-runtime", new Set(["game-session", "app-shell"])],
]);

function featurePackageForPath(value) {
  const match = /^src\/features\/([^/]+)(?:\/|$)/u.exec(value.replaceAll("\\", "/"));
  return match?.[1] ?? null;
}

/** 返回功能包的非法跨包边与循环依赖。 */
async function validateFeatureDependencies() {
  const graph = new Map(
    [...FEATURE_DEPENDENCIES.keys()].map((packageName) => [packageName, new Set()]),
  );
  const violations = [];
  const files = await sourceFiles("src/features");
  for (const file of files) {
    const sourcePackage = featurePackageForPath(file);
    if (!sourcePackage) continue;
    if (!FEATURE_DEPENDENCIES.has(sourcePackage)) {
      violations.push(`${file}（未登记的 feature 功能包 ${sourcePackage}）`);
      continue;
    }
    const text = await readFile(path.join(root, file), "utf8");
    for (const specifier of extractModuleSpecifiers(text)) {
      const targetPackage = featurePackageForPath(
        resolveModuleSpecifier(file.replaceAll("\\", "/"), specifier),
      );
      if (!targetPackage || targetPackage === sourcePackage) continue;
      graph.get(sourcePackage).add(targetPackage);
      if (!FEATURE_DEPENDENCIES.get(sourcePackage).has(targetPackage)) {
        violations.push(
          `${file}: ${specifier}（feature ${sourcePackage} 不得依赖 feature ${targetPackage}）`,
        );
      }
    }
  }

  const state = new Map();
  const stack = [];
  const visit = (packageName) => {
    const current = state.get(packageName);
    if (current === "visiting") {
      const start = stack.indexOf(packageName);
      const cycle = [...stack.slice(start), packageName].join(" -> ");
      violations.push(`feature 功能包存在循环依赖：${cycle}`);
      return;
    }
    if (current === "visited") return;
    state.set(packageName, "visiting");
    stack.push(packageName);
    for (const dependency of graph.get(packageName) ?? []) visit(dependency);
    stack.pop();
    state.set(packageName, "visited");
  };
  for (const packageName of FEATURE_DEPENDENCIES.keys()) visit(packageName);
  return violations;
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
    for (const specifier of extractModuleSpecifiers(text)) {
      if (!rule.forbidden.some((segment) => specifier.includes(segment))) continue;
      violations.push(`${file}: ${specifier}（${rule.message}）`);
    }
  }
}

violations.push(...await validateFeatureDependencies());

for (const file of await sourceFiles("src")) {
  const normalizedFile = file.replaceAll("\\", "/");
  const sourceFloor = /\/floors\/floor(0[1-8])\//u.exec(normalizedFile)?.[1] ?? null;
  const isFloorRegistry = (
    /\/floors\/(?:index|registry|landmarkRegistry)\.ts$/u.test(normalizedFile)
    || /\/content\/curriculum\/mvpLevel\.ts$/u.test(normalizedFile)
    || /\/content\/curriculum\/floor[2-8]Level\.ts$/u.test(normalizedFile)
    || /\/content\/world\/(?:biomeContent|floorMapBlueprints)\.ts$/u.test(normalizedFile)
    || /\/content\/world\/floorExperience\/floor0[1-8]\.ts$/u.test(normalizedFile)
    || /\/content\/world\/floorExperience\/index\.ts$/u.test(normalizedFile)
  );
  const text = await readFile(path.join(root, file), "utf8");
  for (const specifier of extractModuleSpecifiers(text)) {
    const resolvedTarget = resolveModuleSpecifier(normalizedFile, specifier);
    const targetFloor = targetFloorNumber(resolvedTarget)
      ?? /(?:^|\/)floor(0[1-8])(?:\/|$)/u.exec(specifier)?.[1]
      ?? null;
    if (!targetFloor) continue;
    if (sourceFloor && sourceFloor === targetFloor) {
      if (isFloorAggregatorPath(resolvedTarget)) {
        violations.push(
          `${file}: ${specifier}（楼层子单元不得反向依赖 registry/index/聚合器；共同逻辑必须由 shared 提供）`,
        );
      }
      continue;
    }
    if (!sourceFloor && isFloorRegistry) continue;
    violations.push(
      `${file}: ${specifier}（楼层子单元不得引用兄弟楼层；共同逻辑必须上提 shared，由 registry 装配）`,
    );
  }

  if (sourceFloor) {
    for (const specifier of extractModuleSpecifiers(text)) {
      const resolvedTarget = resolveModuleSpecifier(normalizedFile, specifier);
      const isAllowedParentService = (
        /\/content\/curriculum\/floors\/floor0[1-8]\//u.test(normalizedFile)
        && /\/content\/world\/biomeContent$/u.test(resolvedTarget)
      );
      if (isAllowedParentService) continue;
      if (isFloorAggregatorPath(resolvedTarget)) {
        violations.push(
          `${file}: ${specifier}（楼层子单元不得反向依赖 registry/index/聚合器；共同逻辑必须由 shared 提供）`,
        );
      }
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
