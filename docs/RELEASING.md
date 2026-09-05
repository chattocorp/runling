# Release Runling

## One-time setup

Runling is already published on npm. Versions `0.1.0` and `0.2.0` belonged to
the previous package and cannot be reused. Our latest manual release is `0.3.0`.

1. Push the release configuration and `.github/workflows/publish.yml` to `main`
   in `chattocorp/runling`.
2. In **Settings → Actions → General → Workflow permissions**, enable
   **Allow GitHub Actions to create and approve pull requests**. The workflow
   creates release PRs; it does not approve or merge them.
3. In GitHub repository settings, create an environment named `npm`.
   Restrict deployment to the `main` branch, not version tags. Publication runs
   in the workflow triggered on `main`, but checks out the release tag.
   Add a required reviewer if desired
   and supported by your GitHub plan.
4. On npm, open **runling → Settings → Trusted publishing**. Add GitHub Actions:
   - Organization: `chattocorp`
   - Repository: `runling`
   - Workflow filename: `publish.yml`
   - Environment: `npm`
   - Allow direct publishing with `npm publish`.
5. Save. No `NPM_TOKEN` secret is needed.

The workflow uses npm 11.19.0 on Node 24 for publishing. Test jobs use the
repository's Node 22.18.0 baseline. See [npm's trusted-publishing documentation](https://docs.npmjs.com/trusted-publishers/).

## Test the setup without publishing

In GitHub Actions, select **Release → Run workflow** on `main`. This runs the
build, `pnpm test`, and packaging on Linux. The
`runling-package` artifact contains the release tarball. Manual runs never publish.
This verifies packaging, not npm authentication; OIDC authentication happens
only during publication.

## Publish the next version

1. Use Conventional Commits for changes merged into `main`:
   - `fix: ...` requests a patch release.
   - `feat: ...` requests a minor release.
   - `feat!: ...` or a `BREAKING CHANGE:` footer requests a breaking release.
     Before version 1.0, this requests a minor release. From 1.0, it requests
     a major release.
   - `docs: ...`, `test: ...`, and `chore: ...` alone do not request a release.
   With squash merges, use this format for the final commit title.
2. Push or merge the changes to `main`. Release-please creates or updates a
   release PR. Review its version and release notes.
3. Merge the release PR. Release-please creates the `v<VERSION>` tag and GitHub
   release. The same workflow then tests and publishes the package.

Do not bump versions or create tags manually. The manifest starts at `0.3.0`.
The bootstrap commit excludes older history from the first generated changelog.
The first release needs a new `fix:` or `feat:` commit.

The whole repository is one release component. Thus, web-only changes can
request a release. The `simple` release strategy updates root `version.txt`
and `CHANGELOG.md`; a JSON updater changes `packages/runling/package.json`.
The private workspace packages do not get separate releases.
See the [release-please configuration documentation](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md).

The workflow checks that the release tag matches the package version. It checks
the npm registry for both published versions and historical timestamps. Registry
failures stop publication. It then builds the package, runs `pnpm test`, and
packs the release tarball. Publication waits for the package job.
It publishes that exact tarball with
provenance and no package scripts.

Regular CI runs only `pnpm test` after dependency setup, on Linux.
That command builds the framework needed by the CLI tests, then runs Vitest.
Type checks and the clean-install smoke test remain available as local commands
(`pnpm check` and `pnpm test:package`), but are not CI gates.

The jobs use the `release_created` output, not a second tag-triggered workflow.
Tags created with `GITHUB_TOKEN` do not trigger another workflow. For the same
reason, release PR creation does not trigger normal PR checks. If branch rules
require those checks, run **Tests → Run workflow** on the release PR branch
after each update, or use a GitHub App token for release-please.
See the [release-please action documentation](https://github.com/googleapis/release-please-action#other-workflow-runs-and-github_token).

Approve the `npm` environment deployment if required, then check:

```sh
npm view runling version
```

Stable versions only are supported. Do not delete or move published release
tags. If a version was already published, choose a new version rather than
retrying it. npm versions are immutable, even after unpublishing.

If a check or publication fails after tag creation, fix the cause and re-run
the failed jobs in that Actions run. Do not start a new manual run: manual runs
never publish. First confirm that npm did not accept the version. A GitHub
release alone does not prove that npm publication succeeded.
