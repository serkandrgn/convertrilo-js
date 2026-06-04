import { ConvertriloClient } from "@convertrilo/sdk";

const apiKey = process.env.CONVERTRILO_API_KEY;
if (!apiKey) throw new Error("Set CONVERTRILO_API_KEY");

const client = new ConvertriloClient({
  baseUrl: process.env.CONVERTRILO_API_URL || "https://api.convertrilo.com",
  apiKey,
});

async function main() {
  const job = await client.onDemandEncode({
    sourceUrl: "https://example.com/input.mp4",
    codec: "h264",
    resolution: "1080p",
    outputS3: {
      bucket: requireEnv("CUSTOMER_S3_BUCKET"),
      key: "encoded/input-1080p.mp4",
      region: process.env.CUSTOMER_S3_REGION || "us-east-1",
      endpoint: process.env.CUSTOMER_S3_ENDPOINT,
      accessKeyId: requireEnv("CUSTOMER_S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("CUSTOMER_S3_SECRET_ACCESS_KEY"),
      forcePathStyle: process.env.CUSTOMER_S3_FORCE_PATH_STYLE === "true",
    },
  });

  console.log(`Queued job ${job.jobId}`);
  console.log("Poll with client.onDemandStatus(jobId) until status is success.");
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
