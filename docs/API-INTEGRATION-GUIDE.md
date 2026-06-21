# API Integration Guide

This guide is for server-to-server integrations that want to use Convertrilo as a low-cost video encoding backend.

Do not call Convertrilo directly from browser or mobile apps. Keep Convertrilo API keys and storage credentials on your backend.

## VMAF Pass Semantics

VMAF samples candidate settings and performs one optimized final encode. If a client sends both `optimize: "vmaf"` and `passes: 2`, the request remains valid for backward compatibility, but execution and billing use one effective pass.

Estimate and pricing responses expose `requestedPasses` and `effectivePasses`. New integrations should send `passes: 1` when VMAF is enabled.

## Core Model

1. Your app authenticates your user.
2. Your backend collects or owns the source video location.
3. Your backend calls Convertrilo with an API key.
4. Convertrilo queues one or more encode jobs.
5. Your backend tracks completion by polling job status or receiving managed webhooks.

API users do not use the dashboard Google Picker flow. Google Drive automation uses a customer-owned service account whose email has access to the relevant folders.

## Authentication

Create an API key in the dashboard Developer page and send it with every request:

```bash
curl https://api.convertrilo.com/tokens/balance \
  -H "X-API-Key: $CONVERTRILO_API_KEY"
```

Use API keys with the minimum scopes needed by your integration. Most encode integrations need:

- `jobs:create`
- `jobs:read`
- `jobs:cancel` if you expose cancellation
- `credentials:manage` only if your backend manages saved storage credentials via
  the credential-management endpoints

## TypeScript SDK

```bash
pnpm add @convertrilo/sdk
```

```ts
import { ConvertriloClient } from "@convertrilo/sdk";

const client = new ConvertriloClient({
  baseUrl: "https://api.convertrilo.com",
  apiKey: process.env.CONVERTRILO_API_KEY,
});
```

SDK source and examples: https://github.com/serkandrgn/convertrilo-js

## Idempotency

When your backend retries `POST /jobs`, `POST /jobs/bulk`, `POST /ondemand/encode`, or
`POST /ondemand/ingest/folder`, send an idempotency key. The API replays the original response for
the same key and body, and returns `409` if the key is reused with a different body.

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

API errors include a stable `code` field plus a human-readable `message`. Branch on
`code` in your backend, for example `idempotency_conflict`, `insufficient_tokens`,
or `missing_required_scope`.

## Flow 1: URL Source To CDN Output

Use this when the source video is already available over HTTP(S), and you want Convertrilo to return a signed CDN download URL.

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
}, {
  idempotencyKey: "encode-customer-video-123",
});

console.log(job.jobId);
```

Equivalent curl:

```bash
curl https://api.convertrilo.com/ondemand/encode \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CONVERTRILO_API_KEY" \
  -H "Idempotency-Key: encode-customer-video-123" \
  -d '{
    "sourceUrl": "https://example.com/input.mp4",
    "externalId": "customer-video-123",
    "metadata": {
      "customerId": "cus_123",
      "workflow": "daily-compression"
    },
    "codec": "h264",
    "resolution": "1080p",
    "quality": "better"
  }'
```

Poll `/ondemand/status/{jobId}` until the job reaches `success`, then read `downloadUrl`.

Use `externalId` and `metadata` to reconcile Convertrilo jobs with your own database. They are returned by status responses and managed webhook payloads.

Use `Idempotency-Key` on creation requests that your backend may retry. If the same key and request body are received again, Convertrilo returns the original response instead of queuing another job. If the same key is reused with a different body, the API returns `409`.

## Flow 2: URL Source To S3 Output

Use this when your customer wants the encoded output in their own S3-compatible bucket.

The output credentials need permission to write the final object.

```ts
const job = await client.onDemandEncode({
  sourceUrl: "https://example.com/input.mp4",
  codec: "h264",
  resolution: "1080p",
  outputS3: {
    bucket: "customer-output-bucket",
    key: "encoded/input-1080p.mp4",
    region: "us-east-1",
    endpoint: process.env.CUSTOMER_S3_ENDPOINT,
    accessKeyId: process.env.CUSTOMER_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.CUSTOMER_S3_SECRET_ACCESS_KEY,
    forcePathStyle: true,
  },
});
```

For AWS S3, `endpoint` is usually unnecessary. For S3-compatible providers such as Cloudflare R2, MinIO, or object storage providers, pass `endpoint` and usually `forcePathStyle: true`.

## Flow 3: S3 Folder To S3 Output

Use this for batch compression. Convertrilo lists a source prefix, filters video files, and queues one encode job per video.

Source credentials need permission to list the prefix and read objects. Output credentials need permission to write encoded objects.

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
    endpoint: process.env.CUSTOMER_S3_ENDPOINT,
    accessKeyId: process.env.CUSTOMER_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.CUSTOMER_S3_SECRET_ACCESS_KEY,
    forcePathStyle: true,
  },
  outputDestination: "s3",
  outputS3: {
    bucket: "customer-output-bucket",
    prefix: "encoded/",
    region: "us-east-1",
    endpoint: process.env.CUSTOMER_S3_ENDPOINT,
    accessKeyId: process.env.CUSTOMER_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.CUSTOMER_S3_SECRET_ACCESS_KEY,
    forcePathStyle: true,
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

For folder ingest, Convertrilo generates each job `externalId` as `${externalIdPrefix}:${fileName}`.

Only files with video extensions are queued. Use `maxFiles` to cap how many discovered videos are queued from a folder. If no video files are found, the API returns `404`.

## Flow 4: Google Drive With a Service Account

Create a service account in the customer's Google Cloud project and save it once. Convertrilo encrypts the JSON credential and returns only metadata.

```ts
const credential = await client.createGoogleDriveCredential({
  name: "Production Drive",
  serviceAccount: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!),
});
```

Share source folders with `credential.clientEmail` as Reader. Use a Google Shared Drive for
output and add the service account as a member with permission to create files.

For output-only jobs:

```ts
const job = await client.onDemandEncode({
  sourceUrl: "https://example.com/input.mp4",
  codec: "h264",
  resolution: "1080p",
  outputGoogleDrive: {
    folderId: "GOOGLE_DRIVE_OUTPUT_FOLDER_ID",
    fileName: "input-1080p.mp4",
    credentialId: credential.id,
  },
});
```

For folder ingest from Google Drive to Google Drive:

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
  resolution: "1080p",
});
```

Workers load the encrypted credential by ID and mint a fresh short-lived Google token when each job starts.

## Tracking Completion

For simple integrations, poll status:

```ts
async function waitForOnDemandJob(jobId: string) {
  while (true) {
    const status = await client.onDemandStatus(jobId);

    if (status.status === "success") return status;
    if (status.status === "failed" || status.status === "canceled") {
      throw new Error(status.failureMessage || `Job ${status.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
```

For production workflows, prefer managed webhooks. Managed webhooks are HMAC signed and are better for async pipelines. See [WEBHOOKS.md](WEBHOOKS.md).

## Error Handling

Common responses:

- `400`: invalid request payload
- `401`: missing API authentication
- `403`: API key does not have the required scope
- `404`: folder ingest found no video files
- `410`: Dropbox source or destination was requested; Dropbox is deprecated

Treat encode job failure separately from request failure. A request can return `200` because the job was queued, then the job can later fail during download, encode, upload, or credential access.
