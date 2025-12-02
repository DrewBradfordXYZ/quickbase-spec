# QuickBase API Specification

OpenAPI 3.0 specification and test fixtures for the QuickBase JSON RESTful API.

This package is the single source of truth for QuickBase API definitions, used by:
- [quickbase-js](https://github.com/DrewBradfordXYZ/quickbase-js) - TypeScript/JavaScript SDK
- [quickbase-go](https://github.com/DrewBradfordXYZ/quickbase-go) - Go SDK (planned)

## What's Included

### Consumable Outputs (what SDKs use)

These are the language-agnostic files that SDK implementations consume:

```
output/
└── quickbase-patched.json    # OpenAPI 3.0 spec (use for codegen, types, docs)

fixtures/
├── _meta.json                # Fixture format documentation
├── _manual/                  # Hand-crafted fixtures (not regenerated)
│   ├── errors/               # Common error responses (400, 401, 403, etc.)
│   └── records/run-query/    # Pagination sequences, edge cases
├── apps/                     # App endpoint fixtures (generated)
├── tables/                   # Table endpoint fixtures (generated)
├── fields/                   # Field endpoint fixtures (generated)
├── records/                  # Record endpoint fixtures (generated)
├── reports/                  # Report endpoint fixtures (generated)
├── users/                    # User endpoint fixtures (generated)
└── auth/                     # Auth endpoint fixtures (generated)
```

### Tooling (for maintaining the spec)

These are used to build and maintain the spec, not consumed by SDKs:

```
source/                       # Original QuickBase Swagger 2.0 spec
overrides/                    # Schema fixes and patches (YAML)
tools/                        # Build scripts (convert, patch, validate, etc.)
```

## Installation

```bash
npm install quickbase-spec
```

## Usage

### TypeScript/JavaScript

```typescript
// Import the OpenAPI spec
import spec from 'quickbase-spec';
// or
import spec from 'quickbase-spec/openapi.json';

console.log(spec.info.title);  // "QuickBase JSON RESTful API"
console.log(spec.paths);       // All API endpoints
```

```typescript
// Load test fixtures
import { readFileSync } from 'fs';

const fixture = JSON.parse(
  readFileSync('node_modules/quickbase-spec/fixtures/apps/get-app/response.200.json', 'utf-8')
);

console.log(fixture._meta.status);  // 200
console.log(fixture.body);          // Response body
```

### Go

```go
// Embed fixtures directly
//go:embed fixtures/apps/get-app/response.200.json
var getAppFixture []byte

// Or use oapi-codegen with the spec
//go:generate oapi-codegen -package api output/quickbase-patched.json
```

### Other Languages

The output files are plain JSON—use your language's JSON parser to read them:
- `output/quickbase-patched.json` - OpenAPI 3.0 spec for codegen tools
- `fixtures/**/*.json` - Test fixtures for mocking API responses

## Fixtures

### Generated vs Manual

Fixtures in the root directories (`apps/`, `records/`, etc.) are **generated** from examples in the OpenAPI spec using `npm run generate`. These can be safely deleted and regenerated.

Fixtures in `_manual/` are **hand-crafted** for scenarios not covered by the spec:
- `_manual/errors/` - Common error responses (400, 401, 403, 404, 429, 500, 502, 503)
- `_manual/records/run-query/` - Pagination sequences (page1, page2, page3)
- `_manual/records/upsert/` - Partial success scenarios

### Format

All fixtures follow a consistent format:

```json
{
  "_meta": {
    "description": "Successful app retrieval",
    "status": 200,
    "headers": {
      "Content-Type": "application/json"
    }
  },
  "body": {
    "id": "bpqe82s1",
    "name": "Test App",
    "created": "2024-01-01T00:00:00.000Z"
  }
}
```

## Building the Spec

The spec tools process the original QuickBase Swagger 2.0 specification:

```bash
# Full build pipeline
npm run build

# Individual steps
npm run convert    # Swagger 2.0 → OpenAPI 3.0
npm run patch      # Apply fixes from overrides/
npm run validate   # Validate the spec
npm run generate   # Generate fixtures from spec examples
npm run health     # Validate fixtures against spec
```

## Override System

Schema fixes live in `overrides/` as YAML files:

```yaml
# overrides/schemas.yaml
GetFields200Response:
  type: array
  items:
    $ref: '#/components/schemas/Field'
```

These are applied during the `patch` step to fix issues in the original spec.

## Contributing

1. If the original spec has an error, add a fix to `overrides/`
2. Run `npm run build` to regenerate the spec
3. Run `npm run generate` to regenerate fixtures from spec examples
4. Add edge case fixtures to `fixtures/_manual/` (these won't be overwritten)
5. Run `npm run health` to validate all fixtures
6. Submit a PR

## Links

- [QuickBase API Portal](https://developer.quickbase.com/)
- [QuickBase API Reference](https://developer.quickbase.com/operation/getApp)

## License

MIT
