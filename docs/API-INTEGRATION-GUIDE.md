# API Integration Guide

This guide is for server-to-server integrations that want to use Convertrilo as a low-cost video encoding backend.

Do not call Convertrilo directly from browser or mobile apps. Keep Convertrilo API keys, S3 credentials, and Google OAuth tokens on your backend.

## Core Model

1. Your app authenticates your user.
2. Your backend collects or owns the source video location.
3. Your backend calls Convertrilo with an API key.
4. Convertrilo queues one or more encode jobs.
5. Your backend tracks completion by polling job status or receiving managed webhooks.

API users do not need to connect Google Drive in the Convertrilo dashboard. For Google Drive integrations, your app should run its own Google OAuth flow and pass customer-owned `accessToken` and optional `refreshToken` values to Convertrilo.

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
  resolution: "1080p",
}, {
  idempotencyKey: "folder-batch-2026-06-09",
});

for (const job of batch.jobs || []) {
  console.log(job.jobId, job.externalId, job.fileName);
}
```

For folder ingest, Convertrilo generates each job `externalId` as `${externalIdPrefix}:${fileName}`.

Only files with video extensions are queued. If no video files are found, the API returns `404`.

## Flow 4: Google Drive With BYO OAuth Tokens

Use this when your app already owns the customer relationship and can run Google OAuth itself.

Do not send customers to the Convertrilo dashboard OAuth flow for API usage. Your app should request the Google scopes it needs, store tokens on your backend, and pass those tokens to Convertrilo per request.

For output-only jobs:

```ts
const job = await client.onDemandEncode({
  sourceUrl: "https://example.com/input.mp4",
  codec: "h264",
  resolution: "1080p",
  outputGoogleDrive: {
    folderId: "GOOGLE_DRIVE_OUTPUT_FOLDER_ID",
    fileName: "input-1080p.mp4",
    accessToken: customerGoogleAccessToken,
    refreshToken: customerGoogleRefreshToken,
  },
});
```

For folder ingest from Google Drive to Google Drive:

```ts
const batch = await client.onDemandIngestFolder({
  sourceGoogleDrive: {
    folderId: "SOURCE_FOLDER_ID",
    accessToken: customerGoogleAccessToken,
    refreshToken: customerGoogleRefreshToken,
  },
  outputDestination: "google-drive",
  outputGoogleDrive: {
    folderId: "OUTPUT_FOLDER_ID",
    accessToken: customerGoogleAccessToken,
    refreshToken: customerGoogleRefreshToken,
  },
  codec: "h264",
  resolution: "1080p",
});
```

Include `refreshToken` when jobs may outlive a short-lived access token. Without a valid access token or refresh token, Google Drive folder ingest returns `401`.

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
- `401`: missing API auth or missing/expired Google Drive token
- `403`: API key does not have the required scope
- `404`: folder ingest found no video files
- `410`: Dropbox source or destination was requested; Dropbox is deprecated

Treat encode job failure separately from request failure. A request can return `200` because the job was queued, then the job can later fail during download, encode, upload, or token refresh.
