# Convertrilo CLI Quickstart

This guide is for using Convertrilo from the terminal without writing code.

## What The CLI Does

The CLI lets you:

- start an encode job;
- wait for it to finish;
- check an existing job;
- cancel a job;
- check your token balance.

The main command is:

```bash
convertrilo encode "VIDEO_URL" --wait --json
```

That means: take this video URL, encode it, wait until it is done, and print the result.

## 1. Set Your API Key

Easiest option:

```bash
convertrilo login
```

This shows where to create/copy an API key, then saves it at `~/.convertrilo/config.json`.

You can open the API key page directly:

```bash
convertrilo dashboard
```

The page is:

```text
https://convertrilo.com/dashboard/user/developer
```

You can also use an environment variable:

```bash
export CONVERTRILO_API_KEY="cvr_your_api_key_here"
```

To avoid typing it every time, add it to `~/.zshrc`:

```bash
echo 'export CONVERTRILO_API_KEY="cvr_your_api_key_here"' >> ~/.zshrc
source ~/.zshrc
```

## 2. Check That The CLI Is Connected

```bash
convertrilo balance --json
```

If you see token balance JSON, the CLI is connected.

## 3. Encode A Video And Wait

```bash
convertrilo encode "https://example.com/input.mp4" \
  --codec h264 \
  --resolution 720p \
  --quality good \
  --wait \
  --json
```

The important fields in the output are:

```json
{
  "jobId": "job-id-here",
  "status": "success",
  "encoder": "h264_videotoolbox",
  "downloadUrl": "https://..."
}
```

- `jobId` is the job identifier.
- `status: "success"` means the encode finished.
- `encoder` tells you what encoder the worker used.
- `downloadUrl` is the finished video URL.

## 4. Check An Existing Job

```bash
convertrilo status JOB_ID --json
```

Example:

```bash
convertrilo status 9f80982b-ad31-4f0e-b6e3-5bb52d39e675 --json
```

## 5. Wait For An Existing Job

```bash
convertrilo wait JOB_ID --json
```

If the job is already finished, this returns immediately.

## 6. Cancel A Job

```bash
convertrilo cancel JOB_ID --json
```

## 7. Avoid Duplicate Jobs

Use an idempotency key when your script might retry:

```bash
convertrilo encode "https://example.com/input.mp4" \
  --codec h264 \
  --resolution 1080p \
  --quality better \
  --idempotency-key "asset-123:h264:1080p" \
  --wait \
  --json
```

If the same command is retried with the same idempotency key, Convertrilo returns the original job instead of creating another paid job.

## Common Recipes

### Fast H.264 MP4

```bash
convertrilo encode "VIDEO_URL" \
  --codec h264 \
  --resolution 1080p \
  --quality good \
  --wait \
  --json
```

### Smaller H.265 File

```bash
convertrilo encode "VIDEO_URL" \
  --codec h265 \
  --resolution 1080p \
  --quality better \
  --wait \
  --json
```

### CPU Two-Pass

```bash
convertrilo encode "VIDEO_URL" \
  --codec h264 \
  --resolution 1080p \
  --passes 2 \
  --optimize none \
  --wait \
  --json
```

### VMAF Optimization

```bash
convertrilo encode "VIDEO_URL" \
  --codec h264 \
  --resolution 1080p \
  --optimize vmaf \
  --vmaf-target 93 \
  --wait \
  --json
```

## Troubleshooting

### `command not found: convertrilo`

Your terminal cannot find the global npm binary. Run:

```bash
source ~/.zshrc
which convertrilo
```

### `Missing CONVERTRILO_API_KEY`

Save or export your API key:

```bash
convertrilo login
```

or:

```bash
export CONVERTRILO_API_KEY="cvr_your_api_key_here"
```

### The Output Is Huge

That is normal with `--json` because signed download URLs are long. The most important fields are `jobId`, `status`, `encoder`, and `downloadUrl`.

To print one field:

```bash
convertrilo status JOB_ID --field status
```

To print only the download URL:

```bash
convertrilo wait JOB_ID --download-url-only
```
