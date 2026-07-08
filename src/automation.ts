import { ConvertriloClient } from "./index.js";

export type JsonRecord = Record<string, unknown>;

export type EncodeRequest = {
  sourceUrl: string;
  externalId?: string;
  metadata?: JsonRecord;
  codec?: "h264" | "h265" | "av1";
  resolution?: string;
  fps?: number;
  preset?: "fast" | "standard" | "slow";
  bitrateTier?: "low" | "medium" | "high";
  container?: "mp4" | "mkv" | "webm" | "mov";
  jobMode?: "encode" | "hls";
  packageType?: "hls";
  hls?: {
    segmentDuration?: number;
    audioTrackIndex?: number;
    gopSeconds?: number;
    poster?: boolean;
    posterAtSec?: number;
    thumbnails?: {
      enabled?: boolean;
      intervalSec?: number;
      width?: number;
    };
    subtitleWebvttUrl?: string;
    subtitleLanguage?: string;
    subtitleName?: string;
    privatePlayback?: boolean;
    renditions?: Array<{
      height: 360 | 480 | 540 | 720 | 1080;
      videoBitrate?: string;
      audioBitrate?: string;
    }>;
  };
  quality?: "good" | "better" | "best";
  audioPolicy?: "auto" | "copy" | "transcode-aac" | "strip";
  frameRatePolicy?: "preserve" | "cap" | "force";
  scalePolicy?: "no-upscale" | "allow-upscale" | "downscale-only";
  priority?: "normal" | "high";
  outputExpiry?: number;
  webhook?: string;
  passes?: 1 | 2;
  optimize?: "none" | "vmaf";
  vmafTarget?: number;
  outputS3?: {
    bucket: string;
    key?: string;
    prefix?: string;
    region?: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle?: boolean;
  };
  outputGoogleDrive?: {
    folderId: string;
    fileName?: string;
    credentialId?: string;
  };
};

export type AutomationConfig = {
  baseUrl?: string;
  apiKey?: string;
};

export type WaitOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onPoll?: (status: JsonRecord) => void;
};

const terminalStatuses = new Set(["success", "failed", "canceled"]);

export function createAutomationClient(config: AutomationConfig = {}) {
  const baseUrl =
    config.baseUrl ??
    process.env.CONVERTRILO_BASE_URL ??
    "https://api.convertrilo.com";
  const apiKey = config.apiKey ?? process.env.CONVERTRILO_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing CONVERTRILO_API_KEY. Set the environment variable or pass apiKey.",
    );
  }

  return new ConvertriloClient({ baseUrl, apiKey });
}

export function createAutomationClientFromResolvedConfig(config: AutomationConfig) {
  const baseUrl = config.baseUrl ?? "https://api.convertrilo.com";
  const apiKey = config.apiKey;

  if (!apiKey) {
    throw new Error(
      "Missing API key. Run `convertrilo login` or set CONVERTRILO_API_KEY.",
    );
  }

  return new ConvertriloClient({ baseUrl, apiKey });
}

export function parseJsonRecord(value: string, label: string): JsonRecord {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as JsonRecord;
}

export async function createEncodeJob(
  client: ConvertriloClient,
  request: EncodeRequest,
  idempotencyKey?: string,
) {
  return client.onDemandEncode(request as any, { idempotencyKey });
}

export async function waitForJob(
  client: ConvertriloClient,
  jobId: string,
  options: WaitOptions = {},
) {
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const status = (await client.onDemandStatus(jobId)) as JsonRecord;
    options.onPoll?.(status);

    const state = typeof status.status === "string" ? status.status : "";
    if (terminalStatuses.has(state)) {
      return status;
    }

    if (Date.now() + pollIntervalMs > deadline) {
      throw new Error(`Timed out waiting for job ${jobId}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export function isTerminalStatus(status: unknown) {
  return typeof status === "string" && terminalStatuses.has(status);
}
