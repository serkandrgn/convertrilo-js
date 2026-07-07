#!/usr/bin/env node
import { Command, Option } from "commander";
import { confirm, input, password, select } from "@inquirer/prompts";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { ConvertriloApiError } from "./index.js";
import {
  createAutomationClientFromResolvedConfig,
  createEncodeJob,
  type EncodeRequest,
  parseJsonRecord,
  waitForJob,
} from "./automation.js";
import {
  clearCliConfig,
  configPath,
  readCliConfig,
  updateCliConfig,
} from "./config.js";

const appUrl = "https://convertrilo.com";
const developerSettingsUrl = `${appUrl}/dashboard/user/developer`;
const completions = {
  bash: `# Add this to ~/.bashrc:
_convertrilo_completion() {
  local cur commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  commands="login init dashboard keys logout config config:set config:get encode status wait cancel balance doctor download completion"
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
  fi
}
complete -F _convertrilo_completion convertrilo`,
  zsh: `# Add this to ~/.zshrc:
_convertrilo() {
  local -a commands
  commands=(
    'login:save your API key locally'
    'init:alias for login'
    'dashboard:open Developer Settings'
    'keys:open Developer Settings'
    'logout:clear saved credentials'
    'config:manage saved CLI config'
    'encode:create an encode job'
    'status:read job status'
    'wait:wait for a job'
    'cancel:cancel a job'
    'balance:read token balance'
    'doctor:check CLI configuration'
    'download:download a job output'
    'completion:print shell completion'
  )
  _describe 'command' commands
}
compdef _convertrilo convertrilo`,
  fish: `complete -c convertrilo -f -n "__fish_use_subcommand" -a "login init dashboard keys logout config encode status wait cancel balance doctor download completion"`,
} as const;

type OutputOptions = {
  json?: boolean;
  field?: string;
  jobIdOnly?: boolean;
  downloadUrlOnly?: boolean;
};

type DownloadOptions = OutputOptions & {
  output?: string;
  wait?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

type EncodeOptions = OutputOptions & {
  codec?: "h264" | "h265" | "av1";
  resolution?: string;
  quality?: "good" | "better" | "best";
  priority?: "normal" | "high";
  preset?: "fast" | "standard" | "slow";
  bitrateTier?: "low" | "medium" | "high";
  container?: "mp4" | "mkv" | "webm" | "mov";
  fps?: number;
  passes?: 1 | 2;
  optimize?: "none" | "vmaf";
  vmafTarget?: number;
  externalId?: string;
  metadata?: string;
  idempotencyKey?: string;
  webhook?: string;
  outputExpiry?: number;
  outputS3Bucket?: string;
  outputS3Key?: string;
  outputS3Region?: string;
  outputS3Endpoint?: string;
  outputS3AccessKeyId?: string;
  outputS3SecretAccessKey?: string;
  outputS3ForcePathStyle?: boolean;
  wait?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

async function resolvedConfig() {
  const saved = await readCliConfig();
  return {
    apiKey: process.env.CONVERTRILO_API_KEY ?? saved.apiKey,
    baseUrl:
      process.env.CONVERTRILO_BASE_URL ??
      saved.baseUrl ??
      "https://api.convertrilo.com",
  };
}

async function getClient() {
  return createAutomationClientFromResolvedConfig(await resolvedConfig());
}

function wantsMachineOutput(options: OutputOptions = {}) {
  return Boolean(
    options.json ||
      options.field ||
      options.jobIdOnly ||
      options.downloadUrlOnly,
  );
}

function formatProgressValue(progress: unknown, status?: unknown) {
  if (status === "success") return "100%";
  if (status === "failed" || status === "canceled") return "terminal";
  if (typeof progress !== "number" || Number.isNaN(progress)) return "";
  if (progress <= 1) return `${Math.round(progress * 100)}%`;
  return `${Math.round(progress)}%`;
}

function formatJobLine(status: Record<string, unknown>) {
  const parts = [
    `status=${String(status.status ?? "unknown")}`,
    `progress=${formatProgressValue(status.progress, status.status) || "pending"}`,
  ];
  if (status.encoder) parts.push(`encoder=${String(status.encoder)}`);
  if (status.failureMessage) parts.push(`error=${String(status.failureMessage)}`);
  return parts.join(" ");
}

function createProgressReporter(options: OutputOptions = {}) {
  if (wantsMachineOutput(options) || !process.stderr.isTTY) return undefined;

  let lastLength = 0;
  return (status: Record<string, unknown>) => {
    const line = `Waiting: ${formatJobLine(status)}`;
    const padding = lastLength > line.length ? " ".repeat(lastLength - line.length) : "";
    process.stderr.write(`\r${line}${padding}`);
    lastLength = line.length;
  };
}

function finishProgress(reporter: ((status: Record<string, unknown>) => void) | undefined) {
  if (reporter) process.stderr.write("\n");
}

function output(value: unknown, options: OutputOptions = {}) {
  if (options.jobIdOnly) {
    process.stdout.write(`${String((value as any)?.jobId ?? "")}\n`);
    return;
  }
  if (options.downloadUrlOnly) {
    process.stdout.write(`${String((value as any)?.downloadUrl ?? "")}\n`);
    return;
  }
  if (options.field) {
    process.stdout.write(`${String((value as any)?.[options.field] ?? "")}\n`);
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  if (!value || typeof value !== "object") {
    process.stdout.write(`${String(value)}\n`);
    return;
  }

  const record = value as Record<string, unknown>;
  if ("jobId" in record || "downloadUrl" in record || "sourceFilename" in record) {
    const rows = [
      ["jobId", record.jobId],
      ["status", record.status],
      ["encoder", record.encoder],
      ["destination", record.destination],
      ["downloadUrl", record.downloadUrl],
      ["finishedAt", record.finishedAt],
      ["failureMessage", record.failureMessage],
    ] as const;
    for (const [key, item] of rows) {
      if (item === null || item === undefined) continue;
      process.stdout.write(
        `${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}\n`,
      );
    }
    return;
  }

  for (const [key, item] of Object.entries(record)) {
    if (item === null || item === undefined) continue;
    process.stdout.write(
      `${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}\n`,
    );
  }
}

function openUrl(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function maybeOpenDeveloperSettings(force = false) {
  if (
    force ||
    (await confirm({
      message: "Open Convertrilo Developer Settings to create/copy an API key?",
      default: true,
    }))
  ) {
    openUrl(developerSettingsUrl);
    process.stdout.write(`Opened ${developerSettingsUrl}\n`);
  } else {
    process.stdout.write(`Create an API key here: ${developerSettingsUrl}\n`);
  }
}

function buildEncodeRequest(sourceUrl: string, options: EncodeOptions) {
  const request: EncodeRequest = { sourceUrl };
  const fields: Array<[keyof EncodeOptions, keyof EncodeRequest]> = [
    ["externalId", "externalId"],
    ["codec", "codec"],
    ["resolution", "resolution"],
    ["preset", "preset"],
    ["bitrateTier", "bitrateTier"],
    ["container", "container"],
    ["quality", "quality"],
    ["priority", "priority"],
    ["webhook", "webhook"],
    ["optimize", "optimize"],
    ["fps", "fps"],
    ["passes", "passes"],
    ["vmafTarget", "vmafTarget"],
    ["outputExpiry", "outputExpiry"],
  ];

  for (const [optionKey, requestKey] of fields) {
    const value = options[optionKey];
    if (value !== undefined) {
      (request as Record<string, unknown>)[requestKey] = value;
    }
  }

  if (options.metadata) {
    request.metadata = parseJsonRecord(options.metadata, "--metadata");
  }

  if (options.outputS3Bucket) {
    request.outputS3 = {
      bucket: options.outputS3Bucket,
      key: options.outputS3Key,
      region: options.outputS3Region,
      endpoint: options.outputS3Endpoint,
      accessKeyId: options.outputS3AccessKeyId,
      secretAccessKey: options.outputS3SecretAccessKey,
      forcePathStyle: options.outputS3ForcePathStyle,
    };
  }

  return request;
}

async function createAndMaybeWait(sourceUrl: string, options: EncodeOptions) {
  const client = await getClient();
  const created = await createEncodeJob(
    client,
    buildEncodeRequest(sourceUrl, options),
    options.idempotencyKey,
  );

  if (!options.wait) {
    output(created, options);
    return;
  }

  const jobId = (created as { jobId?: string }).jobId;
  if (!jobId) throw new Error("Create response did not include jobId");

  if (!wantsMachineOutput(options)) {
    process.stderr.write(`Created job ${jobId}\n`);
  }
  const reportProgress = createProgressReporter(options);
  const finalStatus = await (async () => {
    try {
      return await waitForJob(client, jobId, {
        pollIntervalMs: options.pollIntervalMs,
        timeoutMs: options.timeoutMs,
        onPoll: reportProgress,
      });
    } finally {
      finishProgress(reportProgress);
    }
  })();
  output(finalStatus, options);
}

async function runWizard() {
  const sourceUrl = await input({
    message: "Video URL",
    validate: (value) => value.length > 0 || "Paste a video URL.",
  });
  const codec = await select({
    message: "Codec",
    choices: [
      { name: "H.264 - most compatible", value: "h264" },
      { name: "H.265 - smaller files", value: "h265" },
      { name: "AV1 - smallest web/archive files", value: "av1" },
    ],
  });
  const resolution = await select({
    message: "Resolution",
    choices: ["720p", "1080p", "1440p", "2160p"].map((value) => ({
      name: value,
      value,
    })),
  });
  const quality = await select({
    message: "Quality",
    choices: [
      { name: "good - faster/cheaper", value: "good" },
      { name: "better - balanced", value: "better" },
      { name: "best - slower/higher quality", value: "best" },
    ],
  });
  const shouldWait = await confirm({
    message: "Wait until the job finishes?",
    default: true,
  });

  await createAndMaybeWait(sourceUrl, {
    codec: codec as EncodeOptions["codec"],
    resolution,
    quality: quality as EncodeOptions["quality"],
    wait: shouldWait,
  });
}

function addOutputOptions(command: Command) {
  return command
    .option("--json", "print JSON output")
    .option("--field <name>", "print a single top-level response field")
    .option("--job-id-only", "print only jobId")
    .option("--download-url-only", "print only downloadUrl");
}

function addEncodeOptions(command: Command) {
  return addOutputOptions(command)
    .addOption(new Option("--codec <codec>").choices(["h264", "h265", "av1"]))
    .option("--resolution <resolution>")
    .addOption(new Option("--quality <quality>").choices(["good", "better", "best"]))
    .addOption(new Option("--priority <priority>").choices(["normal", "high"]))
    .addOption(new Option("--preset <preset>").choices(["fast", "standard", "slow"]))
    .addOption(new Option("--bitrate-tier <tier>").choices(["low", "medium", "high"]))
    .addOption(new Option("--container <container>").choices(["mp4", "mkv", "webm", "mov"]))
    .option("--fps <number>", "frames per second", Number)
    .option("--passes <number>", "encoding passes", Number)
    .addOption(new Option("--optimize <mode>").choices(["none", "vmaf"]))
    .option("--vmaf-target <number>", "VMAF target", Number)
    .option("--external-id <id>")
    .option("--metadata <json>", "JSON object metadata")
    .option("--idempotency-key <key>")
    .option("--webhook <url>")
    .option("--output-expiry <seconds>", "download URL expiry seconds", Number)
    .option("--output-s3-bucket <bucket>")
    .option("--output-s3-key <key>")
    .option("--output-s3-region <region>")
    .option("--output-s3-endpoint <url>")
    .option("--output-s3-access-key-id <key>")
    .option("--output-s3-secret-access-key <secret>")
    .option("--output-s3-force-path-style")
    .option("--wait", "wait until terminal status")
    .option("--poll-interval-ms <ms>", "wait poll interval", Number)
    .option("--timeout-ms <ms>", "wait timeout", Number);
}

async function statusForDownload(jobId: string, options: DownloadOptions) {
  const client = await getClient();
  if (options.wait) {
    const reportProgress = createProgressReporter(options);
    try {
      return await waitForJob(client, jobId, {
        pollIntervalMs: options.pollIntervalMs,
        timeoutMs: options.timeoutMs,
        onPoll: reportProgress,
      });
    } finally {
      finishProgress(reportProgress);
    }
  }
  return client.onDemandStatus(jobId);
}

async function waitAndOutputJob(jobId: string, options: DownloadOptions) {
  const client = await getClient();
  const reportProgress = createProgressReporter(options);
  try {
    return await waitForJob(client, jobId, {
      pollIntervalMs: options.pollIntervalMs,
      timeoutMs: options.timeoutMs,
      onPoll: reportProgress,
    });
  } finally {
    finishProgress(reportProgress);
  }
}

async function downloadJob(jobId: string, options: DownloadOptions) {
  const status = (await statusForDownload(jobId, options)) as {
    downloadUrl?: string | null;
    outputFilename?: string | null;
    status?: string | null;
  };
  if (!status.downloadUrl) {
    throw new Error(
      `Job has no downloadUrl yet. Current status: ${status.status ?? "unknown"}`,
    );
  }

  const outputPath = options.output ?? status.outputFilename ?? `${jobId}.mp4`;
  const response = await fetch(status.downloadUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  await pipeline(response.body as any, createWriteStream(outputPath));
  output({ path: outputPath, status: "downloaded" }, options);
}

async function runDoctor(options: OutputOptions) {
  const config = await resolvedConfig();
  const checks: Record<string, unknown> = {
    node: process.version,
    configPath,
    baseUrl: config.baseUrl,
    hasApiKey: Boolean(config.apiKey),
    envApiKey: Boolean(process.env.CONVERTRILO_API_KEY),
  };

  if (!config.apiKey) {
    output({ ...checks, status: "missing_api_key" }, options);
    return;
  }

  const client = createAutomationClientFromResolvedConfig(config);
  const balance = (await client.getBalance()) as Record<string, unknown>;
  output(
    {
      ...checks,
      status: "ok",
      available: balance.available,
      reserved: balance.reserved,
      balance,
    },
    options,
  );
}

const program = new Command();

program
  .name("convertrilo")
  .description("Convertrilo video encoding CLI")
  .version("0.2.5")
  .action(async () => {
    await runWizard();
  });

program
  .command("login")
  .alias("init")
  .description("save your Convertrilo API key locally")
  .option("--api-key <key>", "API key")
  .option("--base-url <url>", "API base URL")
  .option("--open", "open Developer Settings before asking for the key")
  .action(async (options) => {
    if (!options.apiKey) {
      process.stdout.write(
        `You need a Convertrilo API key from Developer Settings:\n${developerSettingsUrl}\n\n`,
      );
      await maybeOpenDeveloperSettings(Boolean(options.open));
    }
    const apiKey =
      options.apiKey ??
      (await password({ message: "Convertrilo API key", mask: "*" }));
    const baseUrl =
      options.baseUrl ??
      (await input({
        message: "API base URL",
        default: "https://api.convertrilo.com",
      }));
    await updateCliConfig({ apiKey, baseUrl });
    process.stdout.write(`Saved config to ${configPath}\n`);
  });

program
  .command("completion")
  .description("print shell completion setup")
  .argument("[shell]", "bash, zsh, or fish", "zsh")
  .action((shell) => {
    if (!["bash", "zsh", "fish"].includes(shell)) {
      throw new Error("shell must be bash, zsh, or fish");
    }
    process.stdout.write(`${completions[shell as keyof typeof completions]}\n`);
  });

program
  .command("dashboard")
  .alias("keys")
  .description("open Convertrilo Developer Settings for API keys")
  .action(async () => {
    await maybeOpenDeveloperSettings(true);
  });

program
  .command("logout")
  .description("clear saved CLI credentials")
  .action(async () => {
    await clearCliConfig();
    process.stdout.write(`Cleared config at ${configPath}\n`);
  });

const configCommand = program.command("config").description("manage saved CLI config");

configCommand.action(async () => {
    const config = await readCliConfig();
    output({
      path: configPath,
      baseUrl: config.baseUrl,
      hasApiKey: Boolean(config.apiKey),
      envApiKey: Boolean(process.env.CONVERTRILO_API_KEY),
    });
  });

configCommand
  .command("set")
  .description("set a saved config value")
  .argument("<key>", "apiKey or baseUrl")
  .argument("<value>")
  .action(async (key, value) => {
    if (!["apiKey", "baseUrl"].includes(key)) {
      throw new Error("key must be apiKey or baseUrl");
    }
    await updateCliConfig({ [key]: value });
    process.stdout.write(`Updated ${key} in ${configPath}\n`);
  });

configCommand
  .command("get")
  .description("get saved config")
  .argument("[key]", "apiKey or baseUrl")
  .action(async (key) => {
    const config = await readCliConfig();
    if (!key) {
      output({
        path: configPath,
        baseUrl: config.baseUrl,
        hasApiKey: Boolean(config.apiKey),
      });
      return;
    }
    if (key === "apiKey") {
      process.stdout.write(`${config.apiKey ? "[saved]" : ""}\n`);
      return;
    }
    process.stdout.write(`${String((config as any)[key] ?? "")}\n`);
  });

program
  .command("config:set")
  .description("alias for config set")
  .argument("<key>", "apiKey or baseUrl")
  .argument("<value>")
  .action(async (key, value) => {
    if (!["apiKey", "baseUrl"].includes(key)) {
      throw new Error("key must be apiKey or baseUrl");
    }
    await updateCliConfig({ [key]: value });
    process.stdout.write(`Updated ${key} in ${configPath}\n`);
  });

program
  .command("config:get")
  .description("alias for config get")
  .argument("[key]", "apiKey or baseUrl")
  .action(async (key) => {
    const config = await readCliConfig();
    if (!key) {
      output({
        path: configPath,
        baseUrl: config.baseUrl,
        hasApiKey: Boolean(config.apiKey),
      });
      return;
    }
    if (key === "apiKey") {
      process.stdout.write(`${config.apiKey ? "[saved]" : ""}\n`);
      return;
    }
    process.stdout.write(`${String((config as any)[key] ?? "")}\n`);
  });

addEncodeOptions(
  program
    .command("encode")
    .description("create an on-demand encode job")
    .argument("<source-url>", "source video URL"),
).action(createAndMaybeWait);

addOutputOptions(
  program.command("status").description("read job status").argument("<job-id>"),
).action(async (jobId, options) => {
  const client = await getClient();
  output(await client.onDemandStatus(jobId), options);
});

addOutputOptions(
  program.command("wait").description("wait for a job").argument("<job-id>"),
)
  .option("--poll-interval-ms <ms>", "wait poll interval", Number)
  .option("--timeout-ms <ms>", "wait timeout", Number)
  .action(async (jobId, options) => {
    output(await waitAndOutputJob(jobId, options), options);
  });

addOutputOptions(
  program.command("cancel").description("cancel a job").argument("<job-id>"),
).action(async (jobId, options) => {
  const client = await getClient();
  output(await client.onDemandCancel(jobId), options);
});

addOutputOptions(program.command("balance").description("read token balance")).action(
  async (options) => {
    const client = await getClient();
    output(await client.getBalance(), options);
  },
);

addOutputOptions(program.command("doctor").description("check CLI configuration and API connectivity")).action(
  runDoctor,
);

addOutputOptions(
  program.command("download").description("download a completed job output").argument("<job-id>"),
)
  .option("-o, --output <path>", "output file path")
  .option("--wait", "wait until terminal status before downloading")
  .option("--poll-interval-ms <ms>", "wait poll interval", Number)
  .option("--timeout-ms <ms>", "wait timeout", Number)
  .action(downloadJob);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = formatCliError(error);
  process.stderr.write(`convertrilo: ${message}\n`);
  process.exitCode = 1;
});

function parseErrorBody(body: string) {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return String(record.message ?? record.error ?? body);
    }
  } catch {
    // Plain-text API responses are fine.
  }
  return body;
}

function formatCliError(error: unknown) {
  if (error instanceof ConvertriloApiError) {
    const detail = parseErrorBody(error.body).trim();
    if (error.status === 401 || error.status === 403) {
      return `API key was rejected. Run \`convertrilo login\` to save a valid key, or open ${developerSettingsUrl}.`;
    }
    if (error.status === 402) {
      return `Not enough tokens or billing requires attention.${detail ? ` ${detail}` : ""}`;
    }
    if (error.status === 404) {
      return `Not found.${detail ? ` ${detail}` : ""}`;
    }
    if (error.status === 409) {
      return `Request conflicts with existing state.${detail ? ` ${detail}` : ""}`;
    }
    if (error.status === 400 || error.status === 422) {
      return `Invalid request.${detail ? ` ${detail}` : ""}`;
    }
    if (error.status >= 500) {
      return `Convertrilo API is having trouble right now. HTTP ${error.status}.${detail ? ` ${detail}` : ""}`;
    }
    return `HTTP ${error.status} ${error.statusText}.${detail ? ` ${detail}` : ""}`;
  }

  if (error instanceof Error) return error.message;
  return String(error);
}
