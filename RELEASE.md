# Release Checklist

Current release: `0.2.2`

- Replaces custom CLI parsing with `commander`.
- Adds no-args interactive encode wizard.
- Adds `login`, `logout`, `dashboard`, `doctor`, `download`, and friendly config commands.
- Adds output helpers: `--field`, `--job-id-only`, and `--download-url-only`.
- Adds local config storage at `~/.convertrilo/config.json`.
- Adds progress-aware terminal output for `encode --wait`, `wait`, and `download --wait`.
- Adds `convertrilo init` as an alias for `convertrilo login`.
- Adds `convertrilo completion bash|zsh|fish`.
- Improves API error messages for rejected keys, billing/token issues, invalid requests, missing jobs, and API trouble.
- Shows terminal `success` progress as `100%` even if an older backend returns stale `0`.

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
   git commit -am "Release v0.2.2"
   git tag v0.2.2
   ```

9. Publish:

   ```bash
   npm publish --access public
   ```
