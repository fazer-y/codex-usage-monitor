# Contributing

Use Node.js 24.5 or later and Windows for desktop development. The build compiles
the WPF window and window observer with the system .NET Framework compiler.
Install NSIS to build the installer, or set `NSIS_MAKENSIS` to `makensis.exe`.

```powershell
npm ci
npm test
npm run desktop -- --show
npm run desktop:package
npm run desktop:dist
```

`desktop:package` creates an unpacked app in `dist/desktop/windows-x64`.
`desktop:dist` creates the one-click Windows installer in `dist/desktop`.

## Code and documentation

- Write comments, documentation strings, identifiers, and diagnostics in English.
- Keep the English and Chinese READMEs synchronized.
- Write README text for users: functions, behavior, installation, and controls.
- Use short statements and concrete examples. Keep implementation notes in `docs/`.
- Preserve upstream attribution and the MIT license.

## Changes and verification

Keep changes focused and cover accounting, file updates, timing, or selection
changes with behavioral tests. Use synthetic fixtures. Check the packaged app
for docking, conversation changes, live values, responsive layout, and detail
controls.

When changing the price parser, check it against the official pricing page and
update `lib/prices.json`. Cover cache reads, cache writes, conditional requests,
offline startup, and per-request long-context tiers.

Before releasing, run the tests, build the Windows artifacts, update the
changelog, and publish the installer and SHA-256 checksums.
