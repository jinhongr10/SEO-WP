# Windows real-account QA

This runbook collects local-only schema-v1 QA evidence from a Windows 11 x64 physical machine or a Windows 10 x64 virtual machine. It does not provision credentials, publish software, or write to a production site. Real credentials stay inside the packaged app and the local Windows machine.

## Safety boundary

- Use a dedicated non-production WordPress/WooCommerce test site and test AI project. Do not point this process at production.
- Every record created during QA must start with the platform prefix: `codex-win11-` on Windows 11 or `codex-win10-` on Windows 10.
- Never pass credentials to this command. The CLI has no credential flags and writes only allow-listed boolean, count, provider, model, and status summaries.
- `preflight` and `record` refuse non-Windows hosts and any environment where `CI` is set.
- The preflight performs only `GET` requests. It never invokes a mutating backend endpoint.
- Evidence defaults to `test-results/windows-real-account/<platform>/`. `--output-dir` may name only a local filesystem path; URLs and UNC network shares are rejected.
- Do not use GitHub Secrets for real-account QA. Do not run `release:stage`, create or push a tag, create a release, or publish an installer as part of this process.
- Do not perform production writes. Delete every test-prefixed record and verify media rollback before closing the run.

## Test scope

Windows 10 uses the `small-batch` phase in a Win10 x64 VM:

- 3 images
- 3 products
- 3 blogs
- 3 pages

Windows 11 uses the `load` phase on Win11 x64 physical hardware:

- 100 images: 20 local uploads, 70 metadata updates, and 10 replacements followed by rollback
- 50 products
- 20 blogs: 8 standard, 6 special, and 6 repair
- 20 pages: 10 planner and 10 page SEO

Both templates include installer, SmartScreen, shortcuts, scaling, restart, uninstall, Vertex JSON paths containing spaces and Chinese characters, credential persistence/masking, all eight workspaces and their required subtabs, cancel/retry/restart recovery, the v0.1.1 to v0.1.2 updater, diagnostics export, test-record cleanup, and media rollback.

## Obtain the packaged app backend URL

The packaged app starts its backend on a dynamic loopback port. Do not guess the port and do not copy a saved credential path from app settings.

1. Start the packaged Windows app.
2. Open **Settings** and choose **Export diagnostics**.
3. Save the diagnostics JSON to a local temporary folder.
4. Read only the top-level `backendUrl` value, such as `http://127.0.0.1:<dynamic-port>`, and supply that value to `--base-url`.
5. Keep the diagnostics file local. Delete it after the QA report is complete.

The QA report does not store this URL. Its preflight output is reduced to the safe summary fields described below.

## Exact commands

Run these commands in PowerShell from the repository root. Choose a unique prefix for one QA run.

Windows 11 physical-device load run:

```powershell
$Prefix = "codex-win11-20260720-a"
npm run qa:windows:real-account -- init --platform win11 --prefix $Prefix
npm run qa:windows:real-account -- preflight --platform win11 --prefix $Prefix --base-url "http://127.0.0.1:49152"
npm run qa:windows:real-account -- record --platform win11 --prefix $Prefix --case install.installer --status pass --notes "Installer completed on the QA device."
```

Windows 10 VM small-batch run:

```powershell
$Prefix = "codex-win10-20260720-a"
npm run qa:windows:real-account -- init --platform win10 --prefix $Prefix
npm run qa:windows:real-account -- preflight --platform win10 --prefix $Prefix --base-url "http://127.0.0.1:49152"
npm run qa:windows:real-account -- record --platform win10 --prefix $Prefix --case install.installer --status pass --notes "Installer completed in the QA VM."
```

Replace the example port with the `backendUrl` exported by that packaged app session. Do not reuse the example prefix. A local evidence override is optional:

```powershell
npm run qa:windows:real-account -- init --platform win11 --prefix $Prefix --output-dir "D:\Local QA Evidence\win11"
```

Use the identical `--output-dir` for later `preflight` and `record` commands in that run. `init` refuses to overwrite an existing report.

Record each manual case as `pass`, `fail`, or `blocked`. Notes are optional and are sanitized before writing, but operators should still avoid pasting secrets, URLs, usernames, project IDs, or file paths.

```powershell
npm run qa:windows:real-account -- record --platform win11 --prefix $Prefix --case recovery.retry --status blocked --notes "Retry awaits a reproducible test failure."
npm run qa:windows:real-account -- record --platform win11 --prefix $Prefix --case cleanup.media-rollback --status pass --notes "All ten replacement cases were rolled back."
npm run qa:windows:real-account -- record --platform win11 --prefix $Prefix --case cleanup.test-records --status pass --notes "All test-prefixed records were removed."
```

Run `npm run qa:windows:real-account -- --help` for command syntax. Help deliberately contains no secret examples.

## Preflight contract

The fixed preflight checks these endpoints with `GET` only:

1. `/desktop/health`
2. `/desktop/version`
3. `/settings` (public, masked settings response)
4. `/ai/status?probe=true`
5. `/setup/status`
6. `/site-profiles/summary`
7. `/system/network-status?prefer_cached=true`
8. `/media/rest-replace-status`

The persisted summaries contain only booleans, counts, provider/model identifiers, and allow-listed statuses. They omit backend/site URLs, usernames, site or project IDs, credential paths, probe text, response detail, and secret values. Authorization headers, API/password/secret assignments, private-key blocks, WooCommerce `ck_`/`cs_` values, credential paths, and URLs are redacted from manual notes.

## Report schema version 1

Each `<prefix>.json` file contains:

- `schemaVersion`, `platform`, `platformLabel`, `phase`, and `testPrefix`
- exact `expectedBatchCounts`
- overall `status`, `createdAt`, and `updatedAt`
- `preflight` status/timestamp plus the eight safe summaries
- `cleanup` status, media rollback status, and completion timestamp
- `cases`, each with an exact ID, title, `pending|pass|fail|blocked` status, sanitized notes, and timestamp

The overall result remains `pending` while cases are unrecorded, becomes `fail` or `blocked` when any case has that state, and becomes `pass` only when every case passes.

## Completion checklist

Before retaining the local report:

1. Confirm all planned counts match the platform matrix.
2. Record `cleanup.media-rollback` after every replacement is restored.
3. Remove all WordPress/WooCommerce records whose names begin with the run prefix.
4. Record `cleanup.test-records` only after confirming deletion.
5. Confirm the app still masks saved credentials after restart.
6. Delete the exported diagnostics JSON and any temporary local credential-copy used solely for path handling tests.
7. Keep the sanitized report local; do not upload it to GitHub Actions, GitHub Secrets, a release, or a public issue.
