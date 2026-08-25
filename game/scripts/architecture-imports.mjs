// 架构检查的模块依赖扫描工具。
// 只负责从源码中提取静态、副作用和动态 import/export 模块说明符，
// 并把相对路径解析为仓库内的稳定路径；不负责读取文件或决定业务层规则。

import path from "node:path";

/**
 * 提取 TypeScript/JavaScript 中的模块说明符。
 *
 * @param {string} source 源码文本。
 * @returns {string[]} 去重前、按源码出现顺序返回的模块说明符。
 */
export function extractModuleSpecifiers(source) {
  const specifiers = [];
  const pattern = /\b(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/gu;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    if (typeof specifier === "string") specifiers.push(specifier);
  }
  return specifiers;
}

/**
 * 将相对模块说明符解析成相对 src 的规范化路径。
 * 非相对说明符保留原值，避免把第三方包误判为仓库文件。
 *
 * @param {string} sourceFile 相对 src 的源码路径。
 * @param {string} specifier import/export 说明符。
 * @returns {string} 规范化的相对 src 路径或原始包名。
 */
export function resolveModuleSpecifier(sourceFile, specifier) {
  const normalizedFile = sourceFile.replaceAll("\\", "/");
  const normalizedSpecifier = specifier.replaceAll("\\", "/");
  if (!normalizedSpecifier.startsWith(".")) return normalizedSpecifier;
  return path.posix.normalize(
    path.posix.join(path.posix.dirname(normalizedFile), normalizedSpecifier),
  );
}

/**
 * 判断解析后的目标是否是楼层 registry/index/聚合器。
 * 楼层子模块只能消费 shared 与父级契约，不能反向消费这些聚合入口。
 *
 * @param {string} targetPath 相对 src 的规范化路径。
 * @returns {boolean} 是否为楼层聚合入口。
 */
export function isFloorAggregatorPath(targetPath) {
  const normalized = targetPath.replaceAll("\\", "/").replace(/\.[^/.]+$/u, "");
  return /(?:^|\/)content\/world\/floors\/(?:index|registry|landmarkRegistry)$/u.test(normalized)
    || /(?:^|\/)content\/world\/floorExperience\/index$/u.test(normalized)
    || /(?:^|\/)content\/world\/(?:biomeContent|floorMapBlueprints)$/u.test(normalized);
}

/**
 * 解析目标中的楼层编号。
 *
 * @param {string} targetPath 相对 src 的规范化路径。
 * @returns {string|null} `01` 到 `08`，否则返回 null。
 */
export function targetFloorNumber(targetPath) {
  const match = /(?:^|\/)content\/world\/floors\/floor(0[1-8])(?:\/|$)/u.exec(
    targetPath.replaceAll("\\", "/"),
  );
  return match?.[1] ?? null;
}
