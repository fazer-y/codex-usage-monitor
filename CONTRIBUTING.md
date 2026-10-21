# Contributing

Use Node.js 24 and Windows for desktop development. The build compiles the
window observer with the system .NET Framework compiler.

```powershell
npm ci
npm test
npm run desktop -- --show
npm run desktop:package
npm run desktop:dist
```

`desktop:package` creates an unpacked app. `desktop:dist` creates the Windows
ZIP and installer in `dist/desktop`.

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

When updating prices, change `lib/pricing.js`, its verification date, the pricing
tests, and `docs/PRICING.md`. Keep cache reads, cache writes, and per-request
long-context tiers separate.

Before releasing, run the tests, build the Windows artifacts, update the
changelog, and publish the ZIP, installer, and SHA-256 checksums.
