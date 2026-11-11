# QuickBase API Specification

An OpenAPI 3 spec for the [QuickBase JSON API](https://developer.quickbase.com/), built from QuickBase's own published spec with corrections checked against live responses. It is the single source for two SDKs, which include it as a git submodule at `spec/`:

- [quickbase-go](https://github.com/DrewBradfordXYZ/quickbase-go)
- [quickbase-js](https://github.com/DrewBradfordXYZ/quickbase-js)

The file to use is **`output/quickbase-patched.json`**. Everything else here builds it, checks it, or tests against it.

## Why not QuickBase's spec as-is

QuickBase's spec describes the API well but not exactly. The build corrects it:

| QuickBase's spec | Here |
|---|---|
| Omits properties the API returns: a summary field's filter (`summaryQuery`), a reference field's parent table (`masterTableId`), report `query.fields`/`sortBy`/`groupBy`, report settings, field-usage counts, and more | Added (`overrides/response-properties.json`), each found in a live response |
| Report `properties` is an untyped object | Typed: table, chart, summary and map settings |
| Marks almost no object as accepting keys it doesn't list | Every object does, so generated types keep what the API adds (Go: `AdditionalProperties`) |
| `ownerId` is an integer | A string or an integer (personal reports return a string) |
| `sortBy` is an untyped union | An array of sort fields, or `false` |
| Record data, `lineErrors` and several arrays are untyped | Typed |
| `int`, `401/403` and `4xx/5xx` (not valid OpenAPI) | `integer`, `401`, `default` |
| `QB-Realm-Hostname`, `Authorization` and `User-Agent` are operation parameters | Removed; the SDKs set them |
| Renamed `updateSolutionToRecord` to `updateSolutionFromRecord` | The old name is kept, since a rename changes SDK method names |

The rest is QuickBase's: if its spec documents something, so does this one. QBL (YAML), file content and generated documents keep their content type but no schema, so the SDKs send and return them as raw bytes or text.

## How it's built

```
source/quickbase-portal-openapi3.json   QuickBase's spec, from its API portal (fetch-upstream)
  → normalize   inline $refs, keep renamed operations' names, merge allOf, open objects
  → patch       tools/patch.ts and overrides/
  → validate
  → output/quickbase-patched.json
```

```bash
npm ci
npm run build    # normalize, patch, validate
npm run health   # check fixtures (including real responses) against the spec
```

`normalize` inlines the portal's shared schemas so generated type names come from each operation, as they always have.

## Keeping up with QuickBase

QuickBase publishes no spec file; its [API portal](https://developer.quickbase.com/) embeds one in its JavaScript. `fetch-upstream` extracts it as data (nothing from the portal runs) and lists what changed:

```bash
npx tsx tools/cli.ts fetch-upstream          # compare with source/; exits 2 when QuickBase changed it
npx tsx tools/cli.ts fetch-upstream --write  # save it to source/, with the portal version and time
```

A weekly CI job runs it and opens an issue when QuickBase's spec changes. To take a change: `fetch-upstream --write`, `npm run build`, regenerate both SDKs, and review their generated diffs. `fetch-upstream` fails rather than saves when the portal changes how it ships the spec.

## Checking against live responses

`audit-live` calls read-only endpoints on an app you choose and compares every response with the spec. Per operation, it reports properties the spec doesn't define, properties returned with another type, and documented properties no response carried.

```bash
QB_REALM=example.quickbase.com QB_USER_TOKEN=... QB_APP_ID=... \
  npx tsx tools/cli.ts audit-live [report.json]
```

- **Read-only by allowlist**, not by HTTP method: several QuickBase GET endpoints write (`createSolutionFromRecord`, `generateDocument`, ...).
- **A call budget**: `QB_MAX_CALLS` (default 150) and `QB_MAX_TABLES` (default 15). It samples breadth (fields and reports per table, then one of each field type and report type) instead of walking everything, stops at the budget, and still reports. Use a small budget on a production realm.
- **No data in the report**: property names, JSON types and counts, never values or IDs.
- **`QB_CAPTURE=1`** also saves each operation's first response as a fixture, with every value replaced (see below).

Findings become entries in `overrides/response-properties.json`.

## Fixtures

```
fixtures/
├── _live/      real responses captured by audit-live, every value scrubbed
├── _manual/    hand-written: errors, pagination sequences, partial upserts
├── apps/get-app/response.200.json      used by quickbase-js's tests
└── records/upsert/response.200.json    used by quickbase-js's tests
```

Each fixture is `{ "_meta": { "description", "status" }, "body": ... }`, at `{tag}/{operation}/response.{status}[.variant].json`.

`_live/` fixtures keep a real response's shape and types and none of its data: strings become `"x"`, numbers `1`, arrays at most 3 items. `npm run health` validates every fixture against the spec, so CI fails when the spec stops matching what QuickBase returns.

## CI

On every push and pull request: build, require the committed `output/` to match a fresh build, and run the health check. Weekly: the upstream check above.

## Contributing

1. When QuickBase's spec looks wrong, confirm it against a live response with `audit-live`.
2. Fix it in `overrides/response-properties.json` (a missing property) or `tools/patch.ts` (anything else).
3. `npm run build`, then refresh `_live/` fixtures (`QB_CAPTURE=1`) if responses changed.
4. `npm run health`, and regenerate both SDKs to see the effect.

## License

MIT
