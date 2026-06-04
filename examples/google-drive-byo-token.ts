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
    outputGoogleDrive: {
      folderId: requireEnv("GOOGLE_DRIVE_OUTPUT_FOLDER_ID"),
      fileName: "input-1080p.mp4",
      accessToken: requireEnv("CUSTOMER_GOOGLE_ACCESS_TOKEN"),
      refreshToken: process.env.CUSTOMER_GOOGLE_REFRESH_TOKEN,
    },
  });

  console.log(`Queued job ${job.jobId}`);
  console.log("The customer authorizes Google in your app; your backend passes the token here.");
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
