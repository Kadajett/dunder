# Releasing Dunder

Shipping is one command and a push. The version in the root `package.json` is the release
version; `main` always deploys whatever that version is.

```sh
npm run release:bump -- patch   # or minor, major, or an exact version: -- 1.4.0
git push origin main
```

`release:bump` (`scripts/release/bump.mts`) sets the same version on the app (`package.json`,
`package-lock.json`) and the `dunder-ai` installer (`packages/installer`), then commits
`release: v<version>`. It refuses a version that is not newer than the current one.

## What happens on a push to `main`

`.github/workflows/release.yml`:

1. **Checks**: the CI workflow (`npm run check`, installer and site builds). Nothing is
   published unless these pass.
2. **Plan**: `scripts/release/plan.mts` reads the version and the tags on `origin`. If
   `v<version>` exists, the run stops here: pushes without a bump only run the checks. A version
   older than the newest release tag fails the run.
3. **Build**: `npm run dist` builds `Dunder-<version>-linux-x86_64.AppImage` and
   `dunder_<version>_amd64.deb`; `scripts/release/stage-assets.mts` adds `latest.json`
   (`{version, tag, assets: {"linux-x64": {appimage, deb}}}`, download URLs). The GitHub release
   `v<version>` is created with those three files and generated notes; creating it creates the
   tag. Versions with a prerelease part (`1.0.0-rc.1`) become GitHub prereleases.
4. **npm**: `dunder-ai@<version>` is published from `packages/installer` with provenance
   (prereleases under the `next` dist-tag). Skipped with a notice when `NPM_TOKEN` is missing or
   the version is already on npm.
5. **Site**: `npm run site:deploy` deploys the Worker behind dunder.yougotserved.dev, which
   resolves `/latest.json` and `/download/latest/linux-x64` from the latest GitHub release.
   Skipped with a notice when the Cloudflare secrets are missing.

Pull requests and pushes to other branches run `.github/workflows/ci.yml`; pushes to `main` run
the same checks inside the release workflow. Contract tests need a live herdr server and only run
locally (`npm run test:contract`).

## Release notes

The workflow creates the release with GitHub's generated notes, which list commit subjects
(`office-xxx: …`) written for the office, not for users. Draft user-facing notes before a bump:

```sh
bin/office-notes draft            # since the last v* tag; --since <ref>, --out <file> or --out -
```

It reads `git log` and `bd show` and writes `docs/release-notes/next.md`: one bullet per merged
bead (its title and `Try it:` line), grouped New (features), Fixed (bugs) and Improved (the
rest), with bead ids, file paths and the office's names stripped. Agent names come from Dunder's
roster, become "an agent", the chief's becomes "your chief of staff", and yours (from
`git config user.name`) becomes "you". A checklist at the top of the draft lists every swap and
the lines to reread (grammar after a swap, leftover paths). It never commits, pushes or
publishes: edit the draft, then paste it into the GitHub release by hand.

## Re-running a release

Actions → Release → **Run workflow** on `main` rebuilds the current version even if it is
already tagged: the release assets are re-uploaded (replacing the old ones), npm is published if
that version is not there yet, and the site is redeployed. Use it after adding a missing secret
or when a publish step failed.

## Secrets

Add these under GitHub → Kadajett/dunder → Settings → Secrets and variables → Actions →
**New repository secret**. Until they exist, the npm and site jobs skip with a notice and the
GitHub release still goes out.

| Secret | Used for | How to get it |
|---|---|---|
| `NPM_TOKEN` | Publishing `dunder-ai` | npmjs.com → avatar → Access Tokens → Generate New Token → **Granular Access Token**: Packages and scopes → **Read and write**, All packages (the package does not exist before the first publish; narrow it to `dunder-ai` afterwards). Enable "Bypass two-factor authentication" if your account enforces 2FA for writes. |
| `CLOUDFLARE_API_TOKEN` | `wrangler deploy` of the site | dash.cloudflare.com → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** (or a custom token) with at least: Account → **Workers Scripts: Edit** on the account below, and Zone `yougotserved.dev` → **Workers Routes: Edit** and **Zone: Read** (the Worker is attached as the custom domain dunder.yougotserved.dev). |
| `CLOUDFLARE_ACCOUNT_ID` | `wrangler deploy` of the site | `0eed3a2b30da22403053702da618f805` (also shown by `wrangler whoami` and in the dashboard sidebar). |

`GITHUB_TOKEN` is provided by Actions; the release job gets `contents: write` and the npm job
gets `id-token: write` for provenance. Separately, the Worker itself can hold a `GITHUB_TOKEN`
secret (`cd site && npx wrangler secret put GITHUB_TOKEN`, any read-only token) to lift the
anonymous GitHub API rate limit when resolving the latest release; it is optional.

## Doing it by hand

Everything the workflow runs works locally (Node 22.18+ runs the `.mts` scripts directly):

```sh
node scripts/release/plan.mts                      # would this version release?
npm run dist                                       # AppImage + deb into release/
node scripts/release/stage-assets.mts              # release-assets/ with latest.json
node scripts/release/sync-installer-version.mts    # installer version = app version
npm run installer:build && (cd packages/installer && npm publish --access public)
npm run site:deploy
```
