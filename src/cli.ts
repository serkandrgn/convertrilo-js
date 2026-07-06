#!/usr/bin/env node
import {
  createAutomationClient,
  createEncodeJob,
  type EncodeRequest,
  parseJsonRecord,
  waitForJob,
} from "./automation.js";

type ParsedArgs = {
  command?: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
};

const help = `Convertrilo CLI

Usage:
  convertrilo encode <source-url> [options]
  convertrilo status <job-id> [--json]
  convertrilo wait <job-id> [--poll-interval-ms 5000] [--timeout-ms 1800000] [--json]
  convertrilo cancel <job-id> [--json]
  convertrilo balance [--json]

Environment:
  CONVERTRILO_API_KEY       Required API key
  CONVERTRILO_BASE_URL      Defaults to https://api.convertrilo.com

Encode options:
  --codec h264|h265|av1
  --resolution 480p|720p|1080p|1440p|2160p
  --quality good|better|best
  --priority normal|high
  --preset fast|standard|slow
  --bitrate-tier low|medium|high
  --container mp4|mkv|webm|mov
  --fps <number>
  --passes 1|2
  --optimize none|vmaf
  --vmaf-target <number>
  --external-id <id>
  --metadata '{"tenantId":"team_a"}'
  --idempotency-key <key>
  --webhook <url>
  --output-expiry <seconds>
  --output-s3-bucket <bucket>
  --output-s3-key <key>
  --output-s3-region <region>
  --output-s3-endpoint <url>
  --output-s3-access-key-id <key>
  --output-s3-secret-access-key <secret>
  --output-s3-force-path-style
  --wait
  --json

Examples:
  convertrilo encode https://example.com/input.mp4 --codec h264 --resolution 1080p --wait
  convertrilo status 3c4c1e40-1234-4567-890a-123456789abc --json
`;

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const raw = arg.slice(2);
    const eqIndex = raw.indexOf("=");
    if (eqIndex !== -1) {
      flags[raw.slice(0, eqIndex)] = raw.slice(eqIndex + 1);
      continue;
    }

    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      flags[raw] = next;
      i += 1;
    } else {
      flags[raw] = true;
    }
  }

  return { command, positionals, flags };
}

function stringFlag(flags: ParsedArgs["flags"], name: string) {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function numberFlag(flags: ParsedArgs["flags"], name: string) {
  const value = stringFlag(flags, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${name} must be a number`);
  }
  return parsed;
}

function boolFlag(flags: ParsedArgs["flags"], name: string) {
  return flags[name] === true || flags[name] === "true";
}

function outputJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function outputHuman(value: unknown) {
  if (!value || typeof value !== "object") {
    process.stdout.write(`${String(value)}\n`);
    return;
  }

  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (item === null || item === undefined) continue;
    if (typeof item === "object") {
      process.stdout.write(`${key}: ${JSON.stringify(item)}\n`);
    } else {
      process.stdout.write(`${key}: ${String(item)}\n`);
    }
  }
}

function buildEncodeRequest(sourceUrl: string, flags: ParsedArgs["flags"]) {
  const request: EncodeRequest = { sourceUrl };
  const stringFields = [
    ["external-id", "externalId"],
    ["codec", "codec"],
    ["resolution", "resolution"],
    ["preset", "preset"],
    ["bitrate-tier", "bitrateTier"],
    ["container", "container"],
    ["quality", "quality"],
    ["priority", "priority"],
    ["webhook", "webhook"],
    ["optimize", "optimize"],
  ] as const;

  for (const [flagName, key] of stringFields) {
    const value = stringFlag(flags, flagName);
    if (value) {
      (request as Record<string, unknown>)[key] = value;
    }
  }

  const numericFields = [
    ["fps", "fps"],
    ["passes", "passes"],
    ["vmaf-target", "vmafTarget"],
    ["output-expiry", "outputExpiry"],
  ] as const;

  for (const [flagName, key] of numericFields) {
    const value = numberFlag(flags, flagName);
    if (value !== undefined) {
      (request as Record<string, unknown>)[key] = value;
    }
  }

  const metadata = stringFlag(flags, "metadata");
  if (metadata) {
    request.metadata = parseJsonRecord(metadata, "--metadata");
  }

  const s3Bucket = stringFlag(flags, "output-s3-bucket");
  if (s3Bucket) {
    request.outputS3 = {
      bucket: s3Bucket,
      key: stringFlag(flags, "output-s3-key"),
      region: stringFlag(flags, "output-s3-region"),
      endpoint: stringFlag(flags, "output-s3-endpoint"),
      accessKeyId: stringFlag(flags, "output-s3-access-key-id"),
      secretAccessKey: stringFlag(flags, "output-s3-secret-access-key"),
      forcePathStyle: boolFlag(flags, "output-s3-force-path-style"),
    };
  }

  return request;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.command || parsed.command === "help" || boolFlag(parsed.flags, "help")) {
    process.stdout.write(help);
    return;
  }

  const json = boolFlag(parsed.flags, "json");
  const client = createAutomationClient();

  if (parsed.command === "encode") {
    const sourceUrl = parsed.positionals[0];
    if (!sourceUrl) throw new Error("encode requires <source-url>");

    const request = buildEncodeRequest(sourceUrl, parsed.flags);
    const created = await createEncodeJob(
      client,
      request,
      stringFlag(parsed.flags, "idempotency-key"),
    );

    if (!boolFlag(parsed.flags, "wait")) {
      json ? outputJson(created) : outputHuman(created);
      return;
    }

    const jobId = (created as { jobId?: string }).jobId;
    if (!jobId) throw new Error("Create response did not include jobId");

    const finalStatus = await waitForJob(client, jobId, {
      pollIntervalMs: numberFlag(parsed.flags, "poll-interval-ms"),
      timeoutMs: numberFlag(parsed.flags, "timeout-ms"),
      onPoll: (status) => {
        if (!json) {
          process.stderr.write(
            `status=${String(status.status ?? "unknown")} progress=${String(
              status.progress ?? "",
            )}\n`,
          );
        }
      },
    });
    json ? outputJson(finalStatus) : outputHuman(finalStatus);
    return;
  }

  if (parsed.command === "status") {
    const jobId = parsed.positionals[0];
    if (!jobId) throw new Error("status requires <job-id>");
    const status = await client.onDemandStatus(jobId);
    json ? outputJson(status) : outputHuman(status);
    return;
  }

  if (parsed.command === "wait") {
    const jobId = parsed.positionals[0];
    if (!jobId) throw new Error("wait requires <job-id>");
    const status = await waitForJob(client, jobId, {
      pollIntervalMs: numberFlag(parsed.flags, "poll-interval-ms"),
      timeoutMs: numberFlag(parsed.flags, "timeout-ms"),
      onPoll: (state) => {
        if (!json) {
          process.stderr.write(
            `status=${String(state.status ?? "unknown")} progress=${String(
              state.progress ?? "",
            )}\n`,
          );
        }
      },
    });
    json ? outputJson(status) : outputHuman(status);
    return;
  }

  if (parsed.command === "cancel") {
    const jobId = parsed.positionals[0];
    if (!jobId) throw new Error("cancel requires <job-id>");
    const canceled = await client.onDemandCancel(jobId);
    json ? outputJson(canceled) : outputHuman(canceled);
    return;
  }

  if (parsed.command === "balance") {
    const balance = await client.getBalance();
    json ? outputJson(balance) : outputHuman(balance);
    return;
  }

  throw new Error(`Unknown command: ${parsed.command}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`convertrilo: ${message}\n`);
  process.exitCode = 1;
});
