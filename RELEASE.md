# Release Checklist

Current release: `0.1.1`

- Adds a beginner-friendly CLI quickstart for non-SDK users.
- Links the quickstart from the README and technical CLI/MCP guide.
- Keeps the `0.1.0` CLI and MCP runtime behavior unchanged.

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
   git commit -am "Release v0.1.1"
   git tag v0.1.1
   ```

9. Publish:

   ```bash
   npm publish --access public
   ```
