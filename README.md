# Convertrilo TypeScript SDK

Type-safe client for the Convertrilo API.

## Install

```bash
pnpm add @convertrilo/sdk
```

The package currently targets modern Node.js runtimes with global `fetch`. If your runtime does
not provide `fetch`, pass `fetchImpl` to the client.

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
- `google-drive-byo-token.ts` - upload output to Google Drive using customer OAuth tokens from your app
- `folder-ingest-s3.ts` - queue one encode job per video in an S3 prefix

Local SDK smoke tests use `.env`, but published SDK users should provide credentials through their
own server environment. Do not put Convertrilo API keys or customer storage tokens in frontend code.

For a complete server-to-server walkthrough covering URL, S3, folder ingest, Google Drive BYO
OAuth tokens, polling, and webhooks, see
[`docs/API-INTEGRATION-GUIDE.md`](docs/API-INTEGRATION-GUIDE.md).

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

For API integrations, the customer should authorize Google Drive inside your application.
Then your backend passes the resulting Google token to Convertrilo.

```ts
const job = await client.onDemandEncode({
  sourceUrl: "https://example.com/input.mp4",
  codec: "h264",
  resolution: "1080p",
  outputGoogleDrive: {
    folderId: "GOOGLE_DRIVE_FOLDER_ID",
    fileName: "input-1080p.mp4",
    accessToken: customerGoogleAccessToken,
    refreshToken: customerGoogleRefreshToken,
  },
});

console.log(job.jobId);
```

Dashboard Google OAuth is for dashboard workflows. API integrations should use this
bring-your-own-token pattern.

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
  resolution: "1080p",
}, {
  idempotencyKey: "folder-batch-2026-06-09",
});

for (const job of batch.jobs || []) {
  console.log(job.jobId, job.externalId, job.fileName);
}
```

Queue one job per video in a Google Drive folder:

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

for (const job of batch.jobs || []) {
  console.log(job.jobId, job.fileName);
}
```

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
