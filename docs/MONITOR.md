# Continuous Codex monitor

Verified on 2026-10-08 against Oracle Codex CLI 0.160.1.
Official footer: https://learn.chatgpt.com/docs/developer-commands
Configuration: https://learn.chatgpt.com/docs/config-file/config-reference

The native footer accepts built-in item identifiers. No documented custom-command
renderer was found, so this monitor uses an independently sized tmux bottom pane.
It never writes into the Codex input pane. Pane creation is detached and preserves
focus. No global tmux bindings, hooks, Codex config or machine services are changed.

## Accounting

Repeated cumulative token snapshots do not increase cost or request count.
Quota-only events update limits without erasing usage. Model changes without a
new usage delta do not reattribute prior requests. Multiple requests in one turn
are counted separately from distinct turn IDs. Rollbacks or unresolvable usage
gaps make the total unavailable rather than inventing a charge.

## Pricing evidence

USD per million text tokens, Standard processing:

| Exact ID | Input | Cached read | Cache write | Output |
| --- | ---: | ---: | ---: | ---: |
| gpt-6-astra | 10 | 1 | 12.5 | 50 |
| gpt-6.1-sol | 2 | 0.1 | 2.5 | 10 |
| gpt-6-luna | 0.1 | 0.01 | 0.125 | 0.5 |
| gpt-5.5 | 5 | 0.5 | — | 30 |
| gpt-5.4 | 2.5 | 0.25 | — | 15 |
| gpt-5.4-mini | 0.75 | 0.075 | — | 4.5 |
| gpt-5.4-nano | 0.2 | 0.02 | — | 1.25 |
| gpt-5.3-codex | 1.75 | 0.175 | — | 14 |

Sources:
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-5.5
- https://developers.openai.com/api/docs/models/gpt-5.4
- https://developers.openai.com/api/docs/models/gpt-5.4-mini
- https://developers.openai.com/api/docs/models/gpt-5.4-nano

GPT-6 requests above 272k input tokens multiply input/read/write by 2 and output
by 1.5. Rates are applied per request, never using cumulative session tokens as
the context threshold. Unknown models or unsupported cache-write pricing
remain unavailable. The amount excludes Fast mode, regional premiums, and
tool charges; it is a Standard API equivalent, not an actual invoice.

## Verification

Run `npm test` on the source workstation. Regression tests exercise watcher
lifetime and late files, appended usage, duplicated/stale events, mixed models,
unknown prices, official rates, style previews, bounded rendering and config
backups. After deploying the six runtime files, inspect tmux's live pane captures
at different times and after changing the saved style. Keep the Codex pane active.
