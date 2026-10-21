# API-equivalent pricing

The app checks the [OpenAI API price list](https://developers.openai.com/api/docs/pricing)
once at startup. It loads saved rates immediately and updates them in the
background through the system proxy. Successful checks are cached locally.
Offline starts use the saved table or the bundled snapshot.

Each request contributes uncached input, cached input, cache writes, and output.
Cached input uses the model's cache-read rate. Cache writes use the listed
30-minute rate. Reasoning tokens are included in output tokens.

Requests above a model's long-context threshold use that request's tier.
Costs accumulate across requests and models. The details show each component,
cache savings, and the verification date. Unknown models retain their token
statistics; priced portions remain available when historical accounting has gaps.

Estimates use current Standard API prices. Short- and long-context token
subtotals update existing conversations when rates change, without reading
their logs again. The price table matches exact model IDs.

The bundled snapshot is in `lib/prices.json`. Parsing and startup refresh are
in `desktop/pricing-updater.js`; accounting is in `lib/pricing.js`.
