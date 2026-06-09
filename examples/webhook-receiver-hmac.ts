import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";

const secret = process.env.CONVERTRILO_WEBHOOK_SECRET;
if (!secret) throw new Error("Set CONVERTRILO_WEBHOOK_SECRET");

function verifySignature(rawBody: Buffer, signature: string) {
  const expected = createHmac("sha256", secret!).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  return (
    expectedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

const server = http.createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/webhooks/convertrilo") {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const chunks: Buffer[] = [];

  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  request.on("end", () => {
    const rawBody = Buffer.concat(chunks);
    const signature = String(request.headers["x-webhook-signature"] || "");

    if (!signature || !verifySignature(rawBody, signature)) {
      response.writeHead(401);
      response.end("Invalid signature");
      return;
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    console.log("Verified Convertrilo webhook", {
      event: payload.event,
      jobId: payload.data?.jobId,
      status: payload.data?.status,
      externalId: payload.data?.externalId,
    });

    response.writeHead(204);
    response.end();
  });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Webhook receiver listening on http://localhost:${port}/webhooks/convertrilo`);
});
