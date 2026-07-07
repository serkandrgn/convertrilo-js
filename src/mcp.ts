#!/usr/bin/env node
import { createInterface } from "node:readline";
import {
  createAutomationClientFromResolvedConfig,
  createEncodeJob,
  type EncodeRequest,
  waitForJob,
} from "./automation.js";
import { readCliConfig } from "./config.js";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

type ToolCallParams = {
  name?: string;
  arguments?: Record<string, unknown>;
};

const tools = [
  {
    name: "create_encode_job",
    description:
      "Create a Convertrilo on-demand video encoding job from a source URL.",
    inputSchema: {
      type: "object",
      required: ["sourceUrl"],
      properties: {
        sourceUrl: { type: "string", description: "Readable source video URL." },
        externalId: { type: "string" },
        metadata: { type: "object", additionalProperties: true },
        codec: { type: "string", enum: ["h264", "h265", "av1"] },
        resolution: {
          type: "string",
          enum: ["480p", "720p", "1080p", "1440p", "2160p"],
        },
        quality: { type: "string", enum: ["good", "better", "best"] },
        priority: { type: "string", enum: ["normal", "high"] },
        preset: { type: "string", enum: ["fast", "standard", "slow"] },
        container: { type: "string", enum: ["mp4", "mkv", "webm", "mov"] },
        fps: { type: "number" },
        passes: { type: "number", enum: [1, 2] },
        optimize: { type: "string", enum: ["none", "vmaf"] },
        vmafTarget: { type: "number" },
        webhook: { type: "string" },
        idempotencyKey: { type: "string" },
        outputS3: {
          type: "object",
          properties: {
            bucket: { type: "string" },
            key: { type: "string" },
            region: { type: "string" },
            endpoint: { type: "string" },
            accessKeyId: { type: "string" },
            secretAccessKey: { type: "string" },
            forcePathStyle: { type: "boolean" },
          },
          required: ["bucket"],
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_job_status",
    description: "Read the current status for a Convertrilo on-demand job.",
    inputSchema: {
      type: "object",
      required: ["jobId"],
      properties: {
        jobId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "wait_for_job",
    description:
      "Poll a Convertrilo on-demand job until success, failed, or canceled.",
    inputSchema: {
      type: "object",
      required: ["jobId"],
      properties: {
        jobId: { type: "string" },
        pollIntervalMs: { type: "number", default: 5000 },
        timeoutMs: { type: "number", default: 1800000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "cancel_job",
    description: "Cancel a Convertrilo on-demand job.",
    inputSchema: {
      type: "object",
      required: ["jobId"],
      properties: {
        jobId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_token_balance",
    description: "Read the authenticated Convertrilo token balance.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

function send(message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id: JsonRpcRequest["id"], payload: unknown) {
  send({ jsonrpc: "2.0", id, result: payload });
}

function error(id: JsonRpcRequest["id"], code: number, message: string) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function paramsObject(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return {};
  }
  return params as Record<string, unknown>;
}

function stringArg(args: Record<string, unknown>, name: string, required = false) {
  const value = args[name];
  if (typeof value === "string" && value.length > 0) return value;
  if (required) throw new Error(`${name} is required`);
  return undefined;
}

function numberArg(args: Record<string, unknown>, name: string) {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${name} must be a number`);
}

function objectArg(args: Record<string, unknown>, name: string) {
  const value = args[name];
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function buildEncodeRequest(args: Record<string, unknown>) {
  const sourceUrl = stringArg(args, "sourceUrl", true);
  const request: EncodeRequest = { sourceUrl: sourceUrl! };
  const fields = [
    "externalId",
    "codec",
    "resolution",
    "quality",
    "priority",
    "preset",
    "container",
    "optimize",
    "webhook",
  ];

  for (const field of fields) {
    const value = stringArg(args, field);
    if (value) {
      (request as Record<string, unknown>)[field] = value;
    }
  }

  for (const field of ["fps", "passes", "vmafTarget"]) {
    const value = numberArg(args, field);
    if (value !== undefined) {
      (request as Record<string, unknown>)[field] = value;
    }
  }

  const metadata = objectArg(args, "metadata");
  if (metadata) request.metadata = metadata;

  const outputS3 = objectArg(args, "outputS3");
  if (outputS3) request.outputS3 = outputS3 as EncodeRequest["outputS3"];

  return request;
}

async function callTool(params: unknown) {
  const toolCall = paramsObject(params) as ToolCallParams;
  const args = toolCall.arguments ?? {};
  const saved = await readCliConfig();
  const client = createAutomationClientFromResolvedConfig({
    apiKey: process.env.CONVERTRILO_API_KEY ?? saved.apiKey,
    baseUrl:
      process.env.CONVERTRILO_BASE_URL ??
      saved.baseUrl ??
      "https://api.convertrilo.com",
  });

  if (toolCall.name === "create_encode_job") {
    const payload = buildEncodeRequest(args);
    const idempotencyKey = stringArg(args, "idempotencyKey");
    return createEncodeJob(client, payload, idempotencyKey);
  }

  if (toolCall.name === "get_job_status") {
    return client.onDemandStatus(stringArg(args, "jobId", true)!);
  }

  if (toolCall.name === "wait_for_job") {
    return waitForJob(client, stringArg(args, "jobId", true)!, {
      pollIntervalMs: numberArg(args, "pollIntervalMs"),
      timeoutMs: numberArg(args, "timeoutMs"),
    });
  }

  if (toolCall.name === "cancel_job") {
    return client.onDemandCancel(stringArg(args, "jobId", true)!);
  }

  if (toolCall.name === "get_token_balance") {
    return client.getBalance();
  }

  throw new Error(`Unknown tool: ${toolCall.name ?? "missing"}`);
}

async function handle(request: JsonRpcRequest) {
  if (request.method === "initialize") {
    result(request.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: {
        name: "convertrilo-mcp",
        version: "0.2.2",
      },
    });
    return;
  }

  if (request.method === "notifications/initialized") {
    return;
  }

  if (request.method === "tools/list") {
    result(request.id, { tools });
    return;
  }

  if (request.method === "tools/call") {
    const response = await callTool(request.params);
    result(request.id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    });
    return;
  }

  error(request.id, -32601, `Method not found: ${request.method}`);
}

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  if (!line.trim()) return;
  void (async () => {
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch {
      error(null, -32700, "Parse error");
      return;
    }

    try {
      await handle(request);
    } catch (err) {
      error(
        request.id,
        -32000,
        err instanceof Error ? err.message : String(err),
      );
    }
  })();
});
