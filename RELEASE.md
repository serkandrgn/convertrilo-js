# Release Checklist

Current release: `0.2.8`

- Documents safe managed-file deletion for terminal jobs.
- Adds generated types and an SDK method for `DELETE /jobs/{id}`.
- Documents the `job_active` and `job_files_delete_failed` API errors.
- Types cancellation responses with the actual released NEU amount.

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
   git commit -am "Release v0.2.8"
   git tag v0.2.8
   ```

9. Publish:

   ```bash
   npm publish --access public
   ```
