# Webhooks

Convertrilo supports managed webhook subscriptions for job lifecycle events.

Create managed webhooks in the dashboard Developer page or with `POST /webhooks`.
Managed webhook deliveries are signed with HMAC-SHA256.

## Events

- `job.created`
- `job.queued`
- `job.running`
- `job.completed`
- `job.failed`
- `job.canceled`
- `webhook.test` for manual test deliveries

## Headers

Managed webhook deliveries include:

```txt
Content-Type: application/json
X-Webhook-Signature: <hex hmac sha256>
X-Webhook-Event: job.completed
X-Webhook-Id: <webhook id>
```

The signature is:

```txt
hex(hmac_sha256(raw_request_body, webhook_secret))
```

Use the raw request body exactly as received. Do not parse and stringify JSON before verifying.

## Payload

```json
{
  "event": "job.completed",
  "timestamp": "2026-06-05T00:00:00.000Z",
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "9c38f5dd-d9d6-4d08-a514-41e166dfbb8b",
    "status": "success",
    "encoder": "h264_nvenc",
    "durationSec": 42,
    "finalNeu": 2.5
  }
}
```

Failure events include `error` and `failureCode` when available.

## Verify In Node / Express

```ts
import crypto from "node:crypto";
import express from "express";

const app = express();
const webhookSecret = process.env.CONVERTRILO_WEBHOOK_SECRET!;

app.post(
  "/webhooks/convertrilo",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const signature = req.header("X-Webhook-Signature") || "";
    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body)
      .digest("hex");

    const valid =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

    if (!valid) {
      return res.status(401).send("Invalid signature");
    }

    const payload = JSON.parse(req.body.toString("utf8"));
    console.log(payload.event, payload.data.jobId);

    return res.sendStatus(204);
  }
);
```

## Verify In Next.js Route Handler

```ts
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";
  const secret = process.env.CONVERTRILO_WEBHOOK_SECRET!;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  if (!valid) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  console.log(payload.event, payload.data.jobId);

  return new NextResponse(null, { status: 204 });
}
```

## Delivery Behavior

- Timeout: 15 seconds
- Success: any `2xx` response
- Failure: non-`2xx`, network error, or timeout
- A webhook is automatically disabled after 10 consecutive failures
- Re-enable it with `PATCH /webhooks/{id}` and `{ "isActive": true }`

Failed managed deliveries are scheduled for retry when possible.

Retry schedule:

- Attempt 2: about 1 minute after the failed attempt
- Attempt 3: about 5 minutes after the failed attempt
- Attempt 4: about 30 minutes after the failed attempt

Run due retries with:

```bash
pnpm run webhooks:retry
```

Use `--limit` to cap one run:

```bash
pnpm run webhooks:retry -- --limit=50
```

Schedule this command every minute in production. Webhooks are still disabled after
10 consecutive failures.

## Delivery History

Recent managed and test delivery attempts are available with:

```txt
GET /webhooks/{id}/deliveries
```

The response includes the 50 most recent attempts for that webhook:

```json
{
  "deliveries": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "webhookId": "4a5c26a0-7b04-4d37-8bb1-446655440000",
      "event": "job.completed",
      "jobId": "9db109f6-6a88-49d7-89e2-446655440000",
      "status": "success",
      "statusCode": 204,
      "durationMs": 182,
      "responseBody": null,
      "error": null,
      "attempt": 1,
      "nextRetryAt": null,
      "retriedAt": null,
      "createdAt": "2026-06-09T07:30:00.000Z"
    }
  ]
}
```

`responseBody` and `error` are capped at 2048 characters.

## One-Off On-Demand Webhook URL

`POST /ondemand/encode` also accepts a `webhook` URL. That URL receives one terminal callback for
`job.completed`, `job.failed`, or `job.canceled`.

This one-off URL is best-effort and unsigned because it has no stored secret. For production
workflow integrations, prefer managed webhooks.
