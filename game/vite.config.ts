import { defineConfig, type Plugin } from "vite";

const DISTRIBUTION_DOCUMENTS = ["LICENSE", "ATTRIBUTIONS.md"] as const;

function copyDistributionDocuments(): Plugin {
  return {
    name: "copy-distribution-documents",
    apply: "build",
    async writeBundle(outputOptions) {
      if (!outputOptions.dir) throw new Error("Vite build output directory is unavailable.");
      const { copyFile } = await import("node:fs/promises") as {
        copyFile: (source: URL, destination: string) => Promise<void>;
      };
      await Promise.all(DISTRIBUTION_DOCUMENTS.map((fileName) => (
        copyFile(new URL(`../${fileName}`, import.meta.url), `${outputOptions.dir}/${fileName}`)
      )));
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [copyDistributionDocuments()],
  build: {
    target: "es2022",
    sourcemap: false,
    // Phaser 以单个上游 ESM 模块发布，内部无法继续拆分。
    // 将它保留为单独缓存的懒加载分块；此阈值只覆盖这个已知依赖边界，
    // 项目自身的首屏入口仍保持更小体积。
    chunkSizeWarningLimit: 1_800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "phaser-runtime",
              test: /node_modules[\\/]phaser/,
              priority: 10,
            },
            {
              name: "sqlite-runtime",
              test: /node_modules[\\/]sql\.js/,
              priority: 9,
            },
            {
              name: "world-rules",
              test: /src[\\/](?:content|domain)[\\/]/,
              priority: 5,
            },
            {
              name: "app-interface",
              test: /src[\\/](?:audio|feedback|runtime|storage|ui)[\\/]/,
              priority: 4,
            },
          ],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
  },
});
