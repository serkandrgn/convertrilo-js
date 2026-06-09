import { ConvertriloClient } from "@convertrilo/sdk";

const apiKey = process.env.CONVERTRILO_API_KEY;
if (!apiKey) throw new Error("Set CONVERTRILO_API_KEY");

const client = new ConvertriloClient({
  baseUrl: process.env.CONVERTRILO_API_URL || "https://api.convertrilo.com",
  apiKey,
});

async function main() {
  const externalId = `example-upload-${Date.now()}`;

  const job = await client.createJob(
    {
      externalId,
      metadata: {
        customerId: "cus_123",
        workflow: "sdk-idempotency-example",
      },
      codec: "h264",
      resolution: "1080p",
      fps: 30,
    },
    {
      idempotencyKey: `job-${externalId}`,
    },
  );

  console.log(`Created or replayed job ${job.jobId}`);

  const batch = await client.createJobsBulk(
    {
      jobs: [
        {
          externalId: `${externalId}:clip-1`,
          metadata: { customerId: "cus_123" },
          codec: "h264",
          resolution: "1080p",
          fps: 30,
          sourceS3: {
            bucket: "customer-source-bucket",
            key: "incoming/clip-1.mp4",
          },
        },
      ],
      settings: { dryRun: true },
    },
    {
      idempotencyKey: `bulk-${externalId}`,
    },
  );

  console.log(`Created or replayed bulk response with ${batch.totalJobs} job(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
