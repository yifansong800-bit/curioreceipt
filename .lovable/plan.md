## Bug

The museum autocomplete returns empty results for valid queries (e.g. `M+`, `V&A`) and has intermittently 500'd. Root causes in `src/lib/visits.functions.ts`:

1. `normalizeMuseumText("M+")` strips all non-alphanumerics and returns `""`, so `scoreKnownMuseum` bails and local matching yields no hits.
2. When the AI call throws (bad key, network, provider error), the error currently bubbles up as a 500 instead of a safe empty payload.
3. `M+` (Hong Kong) and a few other short-name museums (`V&A` alone is aliased but `M+` isn't) aren't in the local dataset.

## Fix

Edit only `src/lib/visits.functions.ts`:

- Add symbol-preserving fallback: if `normalizeMuseumText(query)` yields `""`, retry with a looser normalizer that keeps `+`, `&`, and digits so `m+`, `v&a`, `21c` still score.
- Add missing short-name museums to `knownMuseums` (e.g. `M+` Hong Kong, `21c Museum`, `Mori Art Museum`).
- Wrap the `suggestMuseums` handler body in `try/catch` returning `{ suggestions: localMuseumSuggestions(query) }` on any thrown error — never surface a 500 to the client.
- Ensure `generateJsonObject` swallows its own errors (already does) and that `dedupeSuggestions` never throws on malformed AI output.

No UI changes. No schema changes.
