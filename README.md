# Convertrilo TypeScript SDK

Type-safe client for the Convertrilo API.

## VMAF And Encoding Passes

When `optimize: "vmaf"` is requested, Convertrilo performs VMAF sampling and one optimized final encode. A supplied `passes: 2` value remains accepted for backward compatibility, but the API uses and bills one effective pass.

Pricing responses expose `requestedPasses` and `effectivePasses`. New integrations should use `passes: 1` with VMAF.

## Install

```bash
pnpm add @convertrilo/sdk
```

The package currently targets modern Node.js runtimes with global `fetch`. If your runtime does
not provide `fetch`, pass `fetchImpl` to the client.

## CLI And MCP Automation

The package includes two executable automation tools:

```bash
export CONVERTRILO_API_KEY="cvr_..."

convertrilo encode https://example.com/input.mp4 \
  --codec h264 \
  --resolution 1080p \
  --audio-policy transcode-aac \
  --frame-rate-policy cap \
  --scale-policy no-upscale \
  --quality better \
  --wait \
  --json

convertrilo-mcp
```

Use `convertrilo` for scripts, CI, cron, and local operations. Use `convertrilo-mcp`
as a stdio MCP server for agent and workflow integrations.

Run `convertrilo login` or `convertrilo init` to save an API key locally, or run
`convertrilo` with no arguments to start the interactive encode wizard. Waiting
commands show terminal progress by default and keep `--json` clean for scripts.

Shell completion snippets are available with:

```bash
convertrilo completion zsh
```

See [`docs/CLI-AND-MCP.md`](docs/CLI-AND-MCP.md) for commands, MCP client config,
S3 output examples, VMAF, two-pass, status, cancel, and balance workflows.

If you want the simplest terminal walkthrough, start with
[`docs/CLI-QUICKSTART.md`](docs/CLI-QUICKSTART.md).

For agent/client setup, use [`docs/MCP-QUICKSTART.md`](docs/MCP-QUICKSTART.md).

MCP registry metadata lives in [`server.json`](server.json).

## Create A Client

```ts
import { ConvertriloClient } from "@convertrilo/sdk";

const client = new ConvertriloClient({
  baseUrl: "https://api.convertrilo.com",
  apiKey: process.env.CONVERTRILO_API_KEY,
});
```

Use an API key for server-to-server integrations. Browser apps should call your own backend,
then your backend calls Convertrilo.

## Examples

The `examples/` directory contains starter scripts for the main integration paths:

- `node-url-to-cdn.ts` - encode a public URL and receive a signed CDN download URL
- `node-url-to-s3.ts` - encode a public URL and upload the result to S3/S3-compatible storage
- `google-drive-byo-token.ts` - upload output to Google Drive using a customer-owned service account
- `folder-ingest-s3.ts` - queue one encode job per video in an S3 prefix
- `idempotency.ts` - safely retry `createJob` and `createJobsBulk`
- `webhook-receiver-hmac.ts` - verify managed webhook HMAC signatures from a Node receiver

Local SDK smoke tests use `.env`, but published SDK users should provide credentials through their
own server environment. Do not put Convertrilo API keys or customer storage tokens in frontend code.

For a complete server-to-server walkthrough covering URL, S3, folder ingest, Google Drive
service accounts, polling, and webhooks, see
[`docs/API-INTEGRATION-GUIDE.md`](docs/API-INTEGRATION-GUIDE.md).

## Idempotent Job Creation

Use an idempotency key when retrying create calls from your backend. Reusing the same key with the
same body returns the original response instead of creating duplicate jobs.

```ts
const job = await client.createJob({
  externalId: "upload-123",
  metadata: { customerId: "cus_123" },
  codec: "h264",
  resolution: "1080p",
  fps: 30,
}, {
  idempotencyKey: "job-upload-123",
});

const batch = await client.createJobsBulk({
  jobs: [
    {
      externalId: "batch-42:clip-1",
      codec: "h264",
      resolution: "1080p",
      fps: 30,
      sourceS3: { bucket: "source", key: "clip-1.mp4" },
    },
  ],
  settings: { confirm: true },
}, {
  idempotencyKey: "bulk-batch-42",
});
```

## Job File Cleanup

Delete managed upload and output objects after a job reaches a terminal state:

```ts
await client.cancelJob(jobId); // required first for created, queued, or running jobs

const result = await client.deleteJobFiles(jobId);
console.log(result.objectsDeleted, result.jobRetained);
```

The job record and billing history remain available for auditing. Active jobs return the stable
`job_active` error until they are canceled.

## Saved Encode Presets

Save reusable encode settings without storing source URLs, storage credentials, or output secrets:

```ts
const preset = await client.createEncodePreset({
  name: "Default 1080p web MP4",
  settings: {
    codec: "h264",
    resolution: "1080p",
    fps: 30,
    preset: "standard",
    bitrateTier: "medium",
    passes: 1,
    policy: "fastest",
    container: "mp4",
    quality: "better",
    optimize: "none",
    vmafTarget: 93,
    audioPolicy: "transcode-aac",
    frameRatePolicy: "cap",
    scalePolicy: "no-upscale",
  },
});

const { presets } = await client.getEncodePresets();
```

## Saved Output Destinations

Save reusable delivery targets without storing raw storage secrets in the destination itself. S3 destinations reference an encrypted saved S3 credential:

```ts
const destination = await client.createOutputDestination({
  name: "Customer uploads bucket",
  config: {
    type: "s3",
    credentialId: "0f5a7f2b-4ff2-45d4-b76f-1f7b6e98d4d1",
    keyPrefix: "processed/",
  },
});

const { destinations } = await client.getOutputDestinations();
```

## URL Source To CDN Output

```ts
const job = await client.onDemandEncode({
  sourceUrl: "https://example.com/input.mp4",
  externalId: "customer-video-123",
  metadata: {
    customerId: "cus_123",
    workflow: "daily-compression",
  },
  codec: "h264",
  resolution: "1080p",
  quality: "better",
  audioPolicy: "transcode-aac",
  frameRatePolicy: "cap",
  scalePolicy: "no-upscale",
}, {
  idempotencyKey: "encode-customer-video-123",
});

let finalStatus;
while (true) {
  finalStatus = await client.onDemandStatus(job.jobId);

  if (finalStatus.status === "success") break;
  if (finalStatus.status === "failed") {
    throw new Error(finalStatus.failureMessage || "Encoding failed");
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
}

console.log(finalStatus.downloadUrl);
console.log(finalStatus.requestedExecution);
console.log(finalStatus.effectiveExecution);
console.log(finalStatus.sourceProbe?.color);
console.log(finalStatus.outputProbe);
```

Terminal users can inspect the same report with:

```bash
convertrilo status JOB_ID --json
convertrilo wait JOB_ID --json
```

## URL Source To S3 Output

```ts
const job = await client.onDemandEncode({
  sourceUrl: "https://example.com/input.mp4",
  codec: "h264",
  resolution: "1080p",
  outputS3: {
    bucket: "customer-output-bucket",
    key: "encoded/input-1080p.mp4",
    region: "us-east-1",
    accessKeyId: process.env.CUSTOMER_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.CUSTOMER_S3_SECRET_ACCESS_KEY,
  },
});

console.log(job.jobId);
```

For S3-compatible services, pass `endpoint` and usually `forcePathStyle: true`.

## URL Source To Google Drive Output

For headless API integrations, save a customer-owned Google service account once.
Use a Google Shared Drive for output and add the returned service-account email as a member
with permission to create files.

```ts
const credential = await client.createGoogleDriveCredential({
  name: "Production Drive",
  serviceAccount: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!),
});

const job = await client.onDemandEncode({
  sourceUrl: "https://example.com/input.mp4",
  codec: "h264",
  resolution: "1080p",
  outputGoogleDrive: {
    folderId: "GOOGLE_DRIVE_FOLDER_ID",
    fileName: "input-1080p.mp4",
    credentialId: credential.id,
  },
});

console.log(job.jobId);
```

Dashboard Google Picker authorization is separate from SDK automation.

## Folder Ingest

Queue one job per video in an S3 prefix:

```ts
const batch = await client.onDemandIngestFolder({
  externalIdPrefix: "batch-2026-06-09",
  metadata: {
    customerId: "cus_123",
    workflow: "folder-compression",
  },
  sourceS3: {
    bucket: "customer-source-bucket",
    prefix: "incoming/",
    region: "us-east-1",
    accessKeyId: process.env.CUSTOMER_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.CUSTOMER_S3_SECRET_ACCESS_KEY,
  },
  outputDestination: "s3",
  outputS3: {
    bucket: "customer-output-bucket",
    prefix: "encoded/",
    region: "us-east-1",
    accessKeyId: process.env.CUSTOMER_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.CUSTOMER_S3_SECRET_ACCESS_KEY,
  },
  codec: "h264",
  maxFiles: 25,
  resolution: "1080p",
}, {
  idempotencyKey: "folder-batch-2026-06-09",
});

for (const job of batch.jobs || []) {
  console.log(job.jobId, job.externalId, job.fileName);
}
```

Use `maxFiles` to cap how many discovered videos are queued from a folder.

Queue one job per video in a Google Drive folder:

```ts
const batch = await client.onDemandIngestFolder({
  sourceGoogleDrive: {
    folderId: "SOURCE_FOLDER_ID",
    credentialId: credential.id,
  },
  outputDestination: "google-drive",
  outputGoogleDrive: {
    folderId: "OUTPUT_FOLDER_ID",
    credentialId: credential.id,
  },
  codec: "h264",
  maxFiles: 25,
  resolution: "1080p",
});

for (const job of batch.jobs || []) {
  console.log(job.jobId, job.fileName);
}
```

Convertrilo mints short-lived Google tokens from the encrypted service-account credential when each worker starts.

Poll each returned `jobId` with `client.onDemandStatus(jobId)`.

## Webhook Delivery History

Managed webhooks are HMAC signed. You can test a webhook and inspect recent delivery attempts:

```ts
await client.testWebhook(webhookId);

const history = await client.getWebhookDeliveries(webhookId);
for (const delivery of history.deliveries || []) {
  console.log(delivery.status, delivery.statusCode, delivery.event);
}
```

## Regenerate Types

The SDK types are generated from `openapi.yaml`.

```bash
pnpm run generate
pnpm run build
```

The generate script uses `--default-non-nullable false` so OpenAPI defaults remain optional
in TypeScript request bodies.
