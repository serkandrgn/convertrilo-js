import { ConvertriloClient } from "@convertrilo/sdk";

const apiKey = process.env.CONVERTRILO_API_KEY;
if (!apiKey) throw new Error("Set CONVERTRILO_API_KEY");

const client = new ConvertriloClient({
  baseUrl: process.env.CONVERTRILO_API_URL || "https://api.convertrilo.com",
  apiKey,
});

async function main() {
  const batch = await client.onDemandIngestFolder({
    sourceS3: {
      bucket: requireEnv("CUSTOMER_SOURCE_S3_BUCKET"),
      prefix: process.env.CUSTOMER_SOURCE_S3_PREFIX || "incoming/",
      region: process.env.CUSTOMER_S3_REGION || "us-east-1",
      endpoint: process.env.CUSTOMER_S3_ENDPOINT,
      accessKeyId: requireEnv("CUSTOMER_S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("CUSTOMER_S3_SECRET_ACCESS_KEY"),
      forcePathStyle: process.env.CUSTOMER_S3_FORCE_PATH_STYLE === "true",
    },
    outputDestination: "s3",
    outputS3: {
      bucket: requireEnv("CUSTOMER_OUTPUT_S3_BUCKET"),
      prefix: process.env.CUSTOMER_OUTPUT_S3_PREFIX || "encoded/",
      region: process.env.CUSTOMER_S3_REGION || "us-east-1",
      endpoint: process.env.CUSTOMER_S3_ENDPOINT,
      accessKeyId: requireEnv("CUSTOMER_S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("CUSTOMER_S3_SECRET_ACCESS_KEY"),
      forcePathStyle: process.env.CUSTOMER_S3_FORCE_PATH_STYLE === "true",
    },
    codec: "h264",
    resolution: "1080p",
  });

  console.log(batch.message);
  for (const job of batch.jobs || []) {
    console.log(`${job.jobId} ${job.fileName ?? ""}`);
  }
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
