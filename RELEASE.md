# Release Checklist

1. Update `openapi.yaml` from the backend API spec.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm run generate`.
4. Run `pnpm run build`.
5. Run the example typecheck:

   ```bash
   pnpm exec tsc --noEmit --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom --types node examples/*.ts
   ```

6. Run `pnpm pack --dry-run` and inspect the tarball contents.
7. Bump `version` in `package.json`.
8. Commit and tag:

   ```bash
   git commit -am "Release v0.1.0"
   git tag v0.1.0
   ```

9. Publish:

   ```bash
   pnpm publish --access public
   ```
