# Convertrilo MCP Marketplace Listing

Use this page as the source of truth when submitting Convertrilo to MCP directories and marketplaces.

## Summary

Convertrilo is an MCP server for video encoding automation. It lets agents and workflow tools create Convertrilo encode jobs, check status, wait for completion, cancel jobs, and inspect token balance through a local stdio MCP server.

## Listing Copy

**Name:** Convertrilo

**Package:** `@convertrilo/sdk`

**MCP server command:** `convertrilo-mcp`

**Transport:** `stdio`

**Repository:** `https://github.com/serkandrgn/convertrilo-js`

**npm:** `https://www.npmjs.com/package/@convertrilo/sdk`

**Website:** `https://convertrilo.com`

**Category:** Video, media, automation, developer tools

**Short description:**

Create and monitor video encoding jobs from MCP clients, agents, scripts, and workflow tools.

**Long description:**

Convertrilo provides an MCP server for automating video encoding workflows. Agents can create retry-safe encode jobs from source URLs, check job status, wait for terminal states, cancel jobs, and inspect token balance. The server runs locally over stdio and uses `CONVERTRILO_API_KEY` for authentication.

## Installation

```bash
npm install -g @convertrilo/sdk
```

## MCP Client Config

```json
{
  "mcpServers": {
    "convertrilo": {
      "command": "convertrilo-mcp",
      "env": {
        "CONVERTRILO_API_KEY": "cvr_your_api_key_here"
      }
    }
  }
}
```

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| `CONVERTRILO_API_KEY` | Yes | Convertrilo API key used to authenticate requests. |
| `CONVERTRILO_BASE_URL` | No | API base URL. Defaults to `https://api.convertrilo.com`. |

## Tools

### `create_encode_job`

Create an on-demand video encoding job from a source URL.

Common inputs:

- `sourceUrl`
- `codec`
- `resolution`
- `quality`
- `priority`
- `externalId`
- `metadata`
- `idempotencyKey`
- `passes`
- `optimize`
- `vmafTarget`
- `outputS3`

### `get_job_status`

Read status for an existing Convertrilo job.

### `wait_for_job`

Poll a job until it reaches `success`, `failed`, or `canceled`.

### `cancel_job`

Cancel an on-demand job.

### `get_token_balance`

Read the authenticated account's token balance.

## Safety Notes

- Use scoped Convertrilo API keys for agent workflows.
- Use `idempotencyKey` when creating jobs from agents or queues.
- Do not expose broad account credentials to untrusted agents.
- Treat signed `downloadUrl` values as temporary private URLs.

## Official MCP Registry

The official registry metadata lives in [`server.json`](../server.json).

Server name:

```text
io.github.serkandrgn/convertrilo
```

The npm package includes a matching `mcpName` field in `package.json` for ownership verification.

## Marketplace Targets

### Official MCP Registry

Use `server.json` and publish with the official MCP publisher flow.

Expected command shape:

```bash
mcp-publisher login github
mcp-publisher publish
```

### Smithery

Smithery supports local stdio servers through MCPB bundles. Use this listing content when creating the server page. If a hosted HTTP MCP server is added later, Smithery can scan that URL directly.

### Glama

Submit the GitHub repository URL:

```text
https://github.com/serkandrgn/convertrilo-js
```

Use the listing copy and MCP client config above.

### mcp.so

Submit via mcp.so's GitHub issue flow with the same name, description, package, command, tools, and repo URL.
