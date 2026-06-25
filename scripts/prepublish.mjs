import { spawnSync } from "node:child_process";

if (process.env.WAVEBIRD_SDK_INTERNAL_PACK === "1") {
  process.exit(0);
}

const commands = [
  ["npm", ["run", "build"]],
  ["npm", ["run", "test:artifact"]],
  ["npm", ["run", "test:examples"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
