import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "relay-tunnel-client-bootstrap",
  "X-GitHub-Api-Version": "2022-11-28",
};

const fail = (message) => {
  throw new Error(message);
};

const getReleaseMetadata = async () => {
  if (process.platform !== "win32") fail("This helper resolves Windows tunnel-client builds only.");
  const architecture = { x64: "amd64", arm64: "arm64" }[process.arch];
  if (!architecture) fail("tunnel-client publishes Windows builds only for x64 and Arm64.");

  const response = await fetch(
    "https://api.github.com/repos/openai/tunnel-client/releases/latest",
    { headers, redirect: "error" },
  );
  if (!response.ok) fail(`The tunnel-client release API returned HTTP ${response.status}.`);
  const release = await response.json();
  if (!release || typeof release !== "object") fail("The release API returned an invalid body.");
  const tag = release.tag_name;
  if (typeof tag !== "string" || !/^v[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/.test(tag)) {
    fail("The latest tunnel-client release did not include a usable version tag.");
  }

  const assetName = `tunnel-client-${tag}-windows-${architecture}.zip`;
  const assets = Array.isArray(release.assets)
    ? release.assets.filter((asset) => asset?.name === assetName)
    : [];
  if (assets.length !== 1) fail(`The latest release did not contain exactly one ${assetName}.`);
  const asset = assets[0];
  const digestMatch = /^sha256:([a-fA-F0-9]{64})$/.exec(asset.digest ?? "");
  if (!digestMatch?.[1]) fail("The release asset did not include a usable SHA-256 digest.");
  if (!Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 500_000_000) {
    fail("The release asset reported an invalid size.");
  }
  if (typeof asset.browser_download_url !== "string")
    fail("The release asset has no download URL.");
  const downloadUrl = new URL(asset.browser_download_url);
  if (
    downloadUrl.protocol !== "https:" ||
    downloadUrl.hostname !== "github.com" ||
    !downloadUrl.pathname.startsWith("/openai/tunnel-client/releases/download/")
  ) {
    fail("The release asset URL was outside the expected official repository path.");
  }

  return {
    tag,
    assetName,
    size: asset.size,
    sha256: digestMatch[1].toUpperCase(),
    downloadUrl: downloadUrl.href,
  };
};

const download = async (urlValue, outputValue, expectedSizeValue) => {
  const url = new URL(urlValue);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    !url.pathname.startsWith("/openai/tunnel-client/releases/download/")
  ) {
    fail("Refusing to download outside the expected official repository path.");
  }
  const expectedSize = Number(expectedSizeValue);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > 500_000_000) {
    fail("The expected archive size is invalid.");
  }
  const output = resolve(outputValue);
  await mkdir(dirname(output), { recursive: true });

  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok || !response.body)
    fail(`The release download returned HTTP ${response.status}.`);
  const hash = createHash("sha256");
  let received = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      meter,
      createWriteStream(output, { flags: "wx" }),
    );
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  }
  if (received !== expectedSize) {
    await rm(output, { force: true });
    fail("The release download size did not match its metadata.");
  }
  process.stdout.write(`${hash.digest("hex").toUpperCase()}\n`);
};

const [command, ...arguments_] = process.argv.slice(2);
if (command === "resolve" && arguments_.length === 0) {
  process.stdout.write(`${JSON.stringify(await getReleaseMetadata())}\n`);
} else if (command === "download" && arguments_.length === 3) {
  await download(arguments_[0], arguments_[1], arguments_[2]);
} else {
  fail("Usage: tunnel-client-release.mjs resolve | download <url> <output> <size>");
}
