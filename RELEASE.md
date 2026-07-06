# Release Checklist

Current release: `0.1.2`

- Adds official MCP Registry metadata in `server.json`.
- Adds `mcpName` and MCP-related npm keywords for registry verification and discovery.
- Adds reusable marketplace listing copy for Smithery, Glama, mcp.so, and registry submissions.

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
   git commit -am "Release v0.1.2"
   git tag v0.1.2
   ```

9. Publish:

   ```bash
   npm publish --access public
   ```
