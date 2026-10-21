# API-equivalent pricing

Prices were checked on 2026-10-21 against the [OpenAI API price list](https://developers.openai.com/api/docs/pricing).

Each request contributes uncached input, cached input, cache writes, and output.
Cached input uses the model's cache-read rate. Cache writes use the listed
30-minute rate. Reasoning tokens are included in output tokens.

Requests above a model's long-context threshold use that request's tier.
Costs accumulate across requests and models. The details show each component,
cache savings, and the verification date. Unknown models retain their token
statistics; priced portions remain available when historical accounting has gaps.

Model rates and matching rules are in `lib/pricing.js`.
