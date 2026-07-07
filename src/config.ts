import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type CliConfig = {
  apiKey?: string;
  baseUrl?: string;
};

const configDir = join(homedir(), ".convertrilo");
export const configPath = join(configDir, "config.json");

export async function readCliConfig(): Promise<CliConfig> {
  try {
    return JSON.parse(await readFile(configPath, "utf8")) as CliConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function writeCliConfig(config: CliConfig) {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function updateCliConfig(patch: CliConfig) {
  const current = await readCliConfig();
  const next = { ...current, ...patch };
  await writeCliConfig(next);
  return next;
}

export async function clearCliConfig() {
  await writeCliConfig({});
}
