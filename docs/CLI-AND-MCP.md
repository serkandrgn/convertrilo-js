# Convertrilo CLI And MCP Server

The SDK package ships two automation entrypoints:

- `convertrilo` - a command-line tool for scripts, CI, cron, and local operations.
- `convertrilo-mcp` - a stdio MCP server for agents and workflow tools.

Both use the same Convertrilo API primitives as the TypeScript SDK.

If you are new to terminal tools, read
[`CLI-QUICKSTART.md`](CLI-QUICKSTART.md) first.

## Environment

```bash
export CONVERTRILO_API_KEY="cvr_..."
export CONVERTRILO_BASE_URL="https://api.convertrilo.com"
```

`CONVERTRILO_BASE_URL` is optional and defaults to production.

## CLI

Create a job:

```bash
convertrilo encode https://example.com/input.mp4 \
  --codec h264 \
  --resolution 1080p \
  --quality better \
  --idempotency-key asset_123:h264:1080p
```

Create and wait:

```bash
convertrilo encode https://example.com/input.mp4 \
  --codec h265 \
  --resolution 1080p \
  --priority high \
  --wait \
  --json
```

Check status:

```bash
convertrilo status <job-id> --json
```

Wait for a terminal state:

```bash
convertrilo wait <job-id> --poll-interval-ms 5000 --timeout-ms 1800000
```

Cancel a job:

```bash
convertrilo cancel <job-id>
```

Read token balance:

```bash
convertrilo balance --json
```

### Advanced Encode Options

```bash
convertrilo encode https://example.com/input.mov \
  --codec h264 \
  --resolution 1080p \
  --passes 2 \
  --optimize none \
  --metadata '{"tenantId":"team_a","workflow":"archive"}'
```

VMAF:

```bash
convertrilo encode https://example.com/input.mov \
  --codec h264 \
  --resolution 1080p \
  --optimize vmaf \
  --vmaf-target 93
```

S3-compatible output:

```bash
convertrilo encode https://example.com/input.mp4 \
  --codec h264 \
  --resolution 1080p \
  --output-s3-bucket customer-media \
  --output-s3-key encoded/input-1080p.mp4 \
  --output-s3-region eu-central \
  --output-s3-endpoint https://s3.example.com \
  --output-s3-force-path-style
```

## MCP Server

Start the server:

```bash
convertrilo-mcp
```

Example MCP client config:

```json
{
  "mcpServers": {
    "convertrilo": {
      "command": "convertrilo-mcp",
      "env": {
        "CONVERTRILO_API_KEY": "cvr_...",
        "CONVERTRILO_BASE_URL": "https://api.convertrilo.com"
      }
    }
  }
}
```

Available tools:

- `create_encode_job`
- `get_job_status`
- `wait_for_job`
- `cancel_job`
- `get_token_balance`

Agents should use scoped API keys and deterministic idempotency keys. Do not give an agent broader account permissions than the workflow requires.
