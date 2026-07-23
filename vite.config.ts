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
        copyFile(new URL(`./${fileName}`, import.meta.url), `${outputOptions.dir}/${fileName}`)
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
    // Phaser ships as one upstream ESM module and cannot be split internally.
    // Keep it in a separately cached lazy chunk; this limit applies to that
    // known vendor boundary, while the first-party entry remains much smaller.
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
          ],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
  },
});
