import { existsSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.resolve(sdkRoot, "dist");
const tscCandidates = [
  path.resolve(sdkRoot, "node_modules", "typescript", "bin", "tsc"),
];
const tscBin = tscCandidates.find((candidate) => existsSync(candidate));

function removeSourceMaps(targetRoot) {
  for (const entry of readdirSync(targetRoot, { withFileTypes: true })) {
    const entryPath = path.resolve(targetRoot, entry.name);
    if (entry.isDirectory()) {
      removeSourceMaps(entryPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".map")) {
      rmSync(entryPath, { force: true });
    }
  }
}

if (!tscBin) {
  console.error(
    "ERROR: typescript not found in node_modules.\n" +
      "Run 'npm install' in the SDK root/."
  );
  process.exit(1);
}

rmSync(distRoot, { recursive: true, force: true });

const result = spawnSync(process.execPath, [tscBin, "-p", "tsconfig.build.json"], {
  cwd: sdkRoot,
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (existsSync(distRoot)) {
  removeSourceMaps(distRoot);
}
