import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

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
  console.log("架构依赖检查通过：domain/content 未越过当前边界。");
}
