# Release Runling

## One-time setup

Runling is already published on npm. Versions `0.1.0` and `0.2.0` belonged to
the previous package and cannot be reused. Our latest manual release is `0.3.0`.

1. Push `.github/workflows/publish.yml` to `chattocorp/runling`.
2. In GitHub repository settings, create an environment named `npm`.
   Restrict deployment to tags matching `v*`. Add a required reviewer if desired
   and supported by your GitHub plan.
3. On npm, open **runling → Settings → Trusted publishing**. Add GitHub Actions:
   - Organization: `chattocorp`
   - Repository: `runling`
   - Workflow filename: `publish.yml`
   - Environment: `npm`
   - Allow direct publishing with `npm publish`.
4. Save. No `NPM_TOKEN` secret is needed.

The workflow uses npm 11.19.0 on Node 24 for publishing. Test jobs use the
repository's Node 22.18.0 baseline. See [npm's trusted-publishing documentation](https://docs.npmjs.com/trusted-publishers/).

## Test the setup without publishing

In GitHub Actions, select **Release → Run workflow** on `main`. This runs the
Linux checks, Windows execution tests, and clean-install smoke test. The
`runling-package` artifact contains the tested tarball. Manual runs never publish.
This verifies packaging, not npm authentication; OIDC authentication happens
only during publication.

## Publish the next version

1. Update `version` in `packages/runling/package.json`, for example to `0.3.1`.
2. Run `node scripts/check-release.mjs`. This checks both published versions
   and historical timestamps. Registry failures stop the check. Absence from
   these fields is not a guarantee that npm will accept publication.
3. Commit and push the change to `main`.
4. Create and push a matching version tag:

   ```sh
   git tag v0.3.1
   git push origin v0.3.1
   ```

The tag triggers publication. Do not push a tag for `0.3.0`: it is already
published. The workflow checks that the tag matches the package version,
builds the package, runs type checks and tests, and installs the tarball in a
clean npm project. Publication waits for both Linux and Windows jobs.
It publishes that exact tested tarball with provenance and no package scripts.

Approve the `npm` environment deployment if required, then check:

```sh
npm view runling version
```

Stable versions only are supported. Do not delete or move published release
tags. If a version was already published, choose a new version rather than
retrying it. npm versions are immutable, even after unpublishing.
