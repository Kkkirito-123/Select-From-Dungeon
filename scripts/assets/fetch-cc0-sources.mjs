/** 下载并校验项目允许使用的 CC0 素材，失败时保留可诊断的文件状态。 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const sourceFlows = {
  "0x72-dungeontileset-ii": "purchase",
  "shade-puny-world": "direct",
  "foozle-scallywag-water-islands": "purchase",
};

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(headers) {
    const values =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : [headers.get("set-cookie")].filter(Boolean);

    for (const value of values) {
      const firstPart = value.split(";", 1)[0];
      const equalsAt = firstPart.indexOf("=");
      if (equalsAt <= 0) continue;
      this.cookies.set(firstPart.slice(0, equalsAt), firstPart.slice(equalsAt + 1));
    }
  }

  toHeader() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function extractCsrf(html) {
  const match = html.match(
    /<meta\s+name=["']csrf_token["']\s+value=["']([^"']+)["']/i,
  );
  if (!match) throw new Error("Official itch.io page did not expose a CSRF token.");
  return match[1];
}

async function trackedFetch(url, jar, init = {}) {
  const headers = new Headers(init.headers);
  const cookie = jar.toHeader();
  if (cookie) headers.set("cookie", cookie);

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: "follow",
  });
  jar.absorb(response.headers);
  return response;
}

async function expectOk(response, context) {
  if (response.ok) return response;
  const body = (await response.text()).slice(0, 500);
  throw new Error(`${context}: HTTP ${response.status} ${body}`);
}

async function postForm(url, jar, referer, fields) {
  const body = new URLSearchParams(fields);
  return trackedFetch(url, jar, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      referer,
    },
  });
}

async function resolveDownloadPage(source, flow, jar) {
  if (flow === "direct") {
    const response = await expectOk(
      await trackedFetch(source.canonicalUrl, jar),
      `Open ${source.id} source page`,
    );
    return {
      url: source.canonicalUrl,
      html: await response.text(),
    };
  }

  const purchaseUrl = `${source.canonicalUrl}/purchase`;
  const purchaseResponse = await expectOk(
    await trackedFetch(purchaseUrl, jar),
    `Open ${source.id} purchase page`,
  );
  const purchaseHtml = await purchaseResponse.text();
  const csrf = extractCsrf(purchaseHtml);

  const downloadUrlResponse = await expectOk(
    await postForm(
      `${source.canonicalUrl}/download_url`,
      jar,
      purchaseUrl,
      {
        csrf_token: csrf,
        reward_id: "",
      },
    ),
    `Resolve ${source.id} free download page`,
  );
  const payload = await downloadUrlResponse.json();
  if (typeof payload.url !== "string") {
    throw new Error(`${source.id}: itch.io did not return a download page URL.`);
  }

  const downloadPageResponse = await expectOk(
    await trackedFetch(payload.url, jar, {
      headers: { referer: purchaseUrl },
    }),
    `Open ${source.id} download page`,
  );
  return {
    url: payload.url,
    html: await downloadPageResponse.text(),
  };
}

function assertTrustedSignedUrl(value) {
  const url = new URL(value);
  const trusted =
    url.protocol === "https:" &&
    (url.hostname.endsWith(".r2.cloudflarestorage.com") ||
      url.hostname.endsWith(".itch.zone") ||
      url.hostname.endsWith(".itch.ovh") ||
      url.hostname === "itch.io" ||
      url.hostname.endsWith(".itch.io"));

  if (!trusted) {
    throw new Error(`Refusing unexpected download host: ${url.hostname}`);
  }
  return url;
}

async function fetchSource(id) {
  const flow = sourceFlows[id];
  if (!flow) throw new Error(`Unknown source id: ${id}`);

  const sourceDir = resolve(repoRoot, "assets", "vendor", id);
  const source = JSON.parse(await readFile(resolve(sourceDir, "source.json"), "utf8"));
  const archive = source.archives?.[0];
  if (!archive) throw new Error(`${id}: source.json has no archive record.`);

  const outputPath = resolve(sourceDir, archive.path);
  if (existsSync(outputPath)) {
    const existing = await readFile(outputPath);
    const existingHash = sha256(existing);
    if (
      existing.byteLength !== archive.bytes ||
      existingHash !== archive.sha256
    ) {
      throw new Error(
        `${id}: existing archive differs from source.json; refusing to overwrite it.`,
      );
    }
    console.log(`✓ ${id}: archive already present and verified`);
    return;
  }

  const jar = new CookieJar();
  const downloadPage = await resolveDownloadPage(source, flow, jar);
  const csrf = extractCsrf(downloadPage.html);

  const fileResponse = await expectOk(
    await postForm(
      source.finalDownloadUrl,
      jar,
      downloadPage.url,
      { csrf_token: csrf },
    ),
    `Resolve ${id} signed file URL`,
  );
  const filePayload = await fileResponse.json();
  const signedUrl = assertTrustedSignedUrl(filePayload.url);

  const archiveResponse = await expectOk(
    await fetch(signedUrl, { redirect: "follow" }),
    `Download ${id} archive`,
  );
  const bytes = new Uint8Array(await archiveResponse.arrayBuffer());
  const actualHash = sha256(bytes);

  if (bytes.byteLength !== archive.bytes || actualHash !== archive.sha256) {
    throw new Error(
      `${id}: upstream archive changed (bytes ${bytes.byteLength}, sha256 ${actualHash}); source.json was not modified.`,
    );
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const partialPath = `${outputPath}.part`;
  await writeFile(partialPath, bytes, { flag: "wx" });
  try {
    await rename(partialPath, outputPath);
  } catch (error) {
    await unlink(partialPath).catch(() => {});
    throw error;
  }
  console.log(`✓ ${id}: downloaded and verified ${archive.sha256}`);
}

function printHelp() {
  console.log(`Usage:
  node scripts/assets/fetch-cc0-sources.mjs [source-id ...]

Without source ids, all declared sources are checked or downloaded.
The script never overwrites an existing archive and rejects upstream hash drift.

Source ids:
  ${Object.keys(sourceFlows).join("\n  ")}`);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const requested = args.length > 0 ? args : Object.keys(sourceFlows);
for (const id of requested) {
  await fetchSource(id);
}
