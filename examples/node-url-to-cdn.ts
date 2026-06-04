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
    quality: "better",
  });

  console.log(`Queued job ${job.jobId}`);

  while (true) {
    const status = await client.onDemandStatus(job.jobId);
    console.log(`status=${status.status} progress=${status.progress ?? 0}`);

    if (status.status === "success") {
      console.log(`downloadUrl=${status.downloadUrl}`);
      return;
    }

    if (status.status === "failed" || status.status === "canceled") {
      throw new Error(status.failureMessage || `Job ended with ${status.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
