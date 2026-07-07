# CLI Polish Test Guide

This guide is for testing the next Convertrilo CLI locally before publishing it to npm.

## Build The Local CLI

From the SDK repo:

```bash
cd /Users/serkan/Desktop/projects/fullstack-projects/convertrilo/convertrilo-js
node --version
npm run build
```

Use Node.js 22 or newer.

Run the local compiled CLI with:

```bash
node dist/src/cli.js --help
```

## Option 1: Test With Environment Variables

```bash
export CONVERTRILO_API_KEY="cvr_your_api_key_here"
node dist/src/cli.js balance --json
```

Create and wait for a job:

```bash
node dist/src/cli.js encode "https://nbg1.your-objectstorage.com/qrateful/test/hevc1080o60.mp4" \
  --codec h264 \
  --resolution 720p \
  --quality good \
  --wait \
  --json
```

Print only the download URL:

```bash
node dist/src/cli.js encode "https://nbg1.your-objectstorage.com/qrateful/test/hevc1080o60.mp4" \
  --codec h264 \
  --resolution 720p \
  --quality good \
  --wait \
  --download-url-only
```

## Option 2: Test Login And Saved Config

Save your API key locally:

```bash
node dist/src/cli.js login
```

If you do not have an API key yet, `login` shows the Developer Settings URL and can open it:

```text
https://convertrilo.com/dashboard/user/developer
```

You can also open that page directly:

```bash
node dist/src/cli.js dashboard
```

Then check config:

```bash
node dist/src/cli.js config
```

Now this works without exporting `CONVERTRILO_API_KEY`:

```bash
node dist/src/cli.js balance --json
```

Check the whole setup:

```bash
node dist/src/cli.js doctor
```

To remove the saved config:

```bash
node dist/src/cli.js logout
```

The config file lives at:

```text
~/.convertrilo/config.json
```

## Option 3: Test The Interactive Wizard

Run the CLI with no command:

```bash
node dist/src/cli.js
```

It asks:

1. Video URL
2. Codec
3. Resolution
4. Quality
5. Whether to wait for completion

For a test URL, use:

```text
https://nbg1.your-objectstorage.com/qrateful/test/hevc1080o60.mp4
```

## Existing Commands Still Work

```bash
node dist/src/cli.js status JOB_ID --json
node dist/src/cli.js wait JOB_ID --json
node dist/src/cli.js cancel JOB_ID --json
```

## MCP Smoke Test

The MCP server should initialize, list tools, and call a read-only balance tool.
It uses the same saved config as `node dist/src/cli.js login`.

```bash
node --input-type=module - <<'NODE'
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["dist/src/mcp.js"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

const responses = [];
let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  stdout += chunk;
  for (;;) {
    const idx = stdout.indexOf("\\n");
    if (idx === -1) break;
    const line = stdout.slice(0, idx);
    stdout = stdout.slice(idx + 1);
    if (line.trim()) responses.push(JSON.parse(line));
  }
});

child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\\n`);
}

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
send({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: { name: "get_token_balance", arguments: {} },
});

await new Promise((resolve) => setTimeout(resolve, 5000));
child.kill("SIGTERM");
await new Promise((resolve) => child.on("close", resolve));

console.log(JSON.stringify({ responses, stderr }, null, 2));
NODE
```

## New Output Helpers

Print one field:

```bash
node dist/src/cli.js status JOB_ID --field status
```

Print only the job id:

```bash
node dist/src/cli.js encode "VIDEO_URL" --job-id-only
```

Print only the download URL:

```bash
node dist/src/cli.js wait JOB_ID --download-url-only
```

## Download A Completed Job

```bash
node dist/src/cli.js download JOB_ID --output ./output.mp4
```

If the job may still be running:

```bash
node dist/src/cli.js download JOB_ID --wait --output ./output.mp4
```

## Friendly Config Aliases

Both styles work:

```bash
node dist/src/cli.js config set apiKey cvr_your_api_key_here
node dist/src/cli.js config:get apiKey
```
