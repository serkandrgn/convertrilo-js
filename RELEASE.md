# Release Checklist

Current release: `0.1.0`

- Adds the `convertrilo` CLI for encode, status, wait, cancel, and balance workflows.
- Adds the `convertrilo-mcp` stdio MCP server for agent and workflow integrations.
- Adds shared automation helpers for API-key configuration, job creation, and polling.
- Documents CLI, MCP, VMAF, two-pass, S3 output, and agent-safe usage.

1. Update `openapi.yaml` from the backend API spec.
2. Run `npm run generate`.
3. Run `npm run build`.
4. Run the CLI and MCP smoke tests.
5. Run the example typecheck:

   ```bash
   ./node_modules/.bin/tsc --noEmit --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom --types node examples/*.ts
   ```

6. Run `npm pack --dry-run` and inspect the tarball contents.
7. Run a tarball install test and verify `convertrilo` plus `convertrilo-mcp`.
8. Commit and tag:

   ```bash
   git commit -am "Release v0.1.0"
   git tag v0.1.0
   ```

9. Publish:

   ```bash
   npm publish --access public
   ```
