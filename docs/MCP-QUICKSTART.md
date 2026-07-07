# Convertrilo MCP Quickstart

The npm package installs `convertrilo-mcp`, a local stdio MCP server for video
encoding agents and workflow tools.

## Install

```bash
npm install -g @convertrilo/sdk
```

## Authenticate

Recommended local setup:

```bash
convertrilo login --open
```

This opens Developer Settings, asks for an API key, and saves it at:

```text
~/.convertrilo/config.json
```

`convertrilo-mcp` reads that saved config. For CI or remote agent hosts, set:

```bash
export CONVERTRILO_API_KEY="cvr_..."
export CONVERTRILO_BASE_URL="https://api.convertrilo.com"
```

## MCP Client Config

```json
{
  "mcpServers": {
    "convertrilo": {
      "command": "convertrilo-mcp"
    }
  }
}
```

During local package development, point the client at the built file:

```json
{
  "mcpServers": {
    "convertrilo": {
      "command": "node",
      "args": [
        "/Users/serkan/Desktop/projects/fullstack-projects/convertrilo/convertrilo-js/dist/src/mcp.js"
      ]
    }
  }
}
```

## Tools

- `create_encode_job`
- `get_job_status`
- `wait_for_job`
- `cancel_job`
- `get_token_balance`

Start by calling `get_token_balance`. Then create jobs with explicit codec,
resolution, quality, priority, and destination settings.

Example `create_encode_job` arguments:

```json
{
  "sourceUrl": "https://example.com/input.mp4",
  "codec": "h264",
  "resolution": "1080p",
  "quality": "better",
  "audioPolicy": "transcode-aac",
  "frameRatePolicy": "cap",
  "scalePolicy": "no-upscale",
  "idempotencyKey": "asset-123:h264:1080p"
}
```

After `wait_for_job`, inspect `effectiveExecution`, `sourceProbe`,
`outputProbe`, and `warnings` before reporting success to a user.

## Safety Notes

Use scoped API keys. Agents should only receive the permissions needed for the
workflow they are allowed to run. Use deterministic idempotency keys when an
agent may retry the same request.
