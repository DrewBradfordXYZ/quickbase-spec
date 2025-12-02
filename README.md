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

### For SDK Development (Recommended)

Use a git submodule to keep the spec in sync across SDK repositories:

```bash
# Add as a submodule
git submodule add https://github.com/DrewBradfordXYZ/quickbase-spec.git spec

# Clone a repo with submodules
git clone --recurse-submodules <your-sdk-repo>

# Update to latest spec
git submodule update --remote spec
```

This approach:
- Keeps spec versioned with your SDK
- Makes fixture paths relative (`spec/fixtures/...`)
- Allows pinning to specific spec commits
- Works with any language (Go, TypeScript, Python, etc.)

### As an npm Package

```bash
npm install quickbase-spec
```

## Updating the Spec in Your SDK

When quickbase-spec is updated, SDK authors should:

**1. Update the submodule:**
```bash
git submodule update --remote spec
git add spec
```

**2. Check for breaking changes:**

Fixture paths may change between versions:
- Generated fixtures may gain variant suffixes (e.g., `response.200.json` → `response.200.simple-application.json`)
- Manual fixtures live in `_manual/` (e.g., `_manual/errors/`, `_manual/records/run-query/`)
- Operation folders use kebab-case operationId (e.g., `getApp` → `get-app`)

**3. Update fixture loading code if needed:**

```typescript
// Before: assumed single fixture per status
loadFixture(`${domain}/${op}/response.${status}.json`)

// After: may need to handle variants or _manual paths
loadFixture(`${domain}/${op}/response.${status}.${variant}.json`)
loadFixture(`_manual/${domain}/${op}/response.${status}.${variant}.json`)
```

**4. Regenerate types** (if using codegen):
```bash
# Go (oapi-codegen)
oapi-codegen -package api spec/output/quickbase-patched.json > api/types.gen.go

# TypeScript (openapi-typescript)
npx openapi-typescript spec/output/quickbase-patched.json -o src/types.gen.ts
```

**5. Run tests and commit:**
```bash
npm test  # or go test ./...
git add spec
git commit -m "chore: update quickbase-spec submodule"
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
// Use oapi-codegen with the spec for type generation
//go:generate oapi-codegen -package api spec/output/quickbase-patched.json

// Go SDKs typically use inline struct literals for tests (see "Should Your SDK Use Fixtures?")
```

### Other Languages

The output files are plain JSON—use your language's JSON parser to read them:
- `output/quickbase-patched.json` - OpenAPI 3.0 spec for codegen tools
- `fixtures/**/*.json` - Test fixtures for mocking API responses

## Fixtures

### Should Your SDK Use Fixtures?

Fixtures are most valuable for dynamically-typed languages where JSON is native. Statically-typed languages often benefit more from inline test data with compile-time type checking.

| Language | Use Fixtures? | Reason |
|----------|---------------|--------|
| **TypeScript/JavaScript** | Yes | JSON is native, duck typing, mocking libraries expect JSON |
| **Python** | Yes | Dynamic typing, dicts work naturally with JSON |
| **Ruby** | Yes | Dynamic typing, hashes map directly to JSON |
| **Go** | No | Table-driven tests with struct literals preferred, compile-time type safety |
| **Rust** | No | Strong typing, serde requires explicit types anyway |
| **Java/Kotlin** | Maybe | Depends on testing style; frameworks like WireMock can use JSON files |
| **C#** | Maybe | Similar to Java; depends on mocking approach |

**All languages** should use `output/quickbase-patched.json` for type/client generation.

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

### File Naming Convention

```
fixtures/{tag}/{operationId}/response.{status}.json      # Response fixtures
fixtures/{tag}/{operationId}/response.{status}.{variant}.json  # Multiple examples
fixtures/{tag}/{operationId}/request.json                # Request body fixtures
fixtures/_manual/errors/response.{status}.json           # Common errors
fixtures/_manual/{tag}/{operationId}/                    # Edge cases
```

### Testing with Fixtures

Use fixtures to mock API responses in your SDK tests.

**TypeScript (with msw or nock):**

```typescript
import { readFileSync } from 'fs';
import { http, HttpResponse } from 'msw';

// Helper to load fixtures
function loadFixture(path: string) {
  return JSON.parse(readFileSync(`node_modules/quickbase-spec/fixtures/${path}`, 'utf-8'));
}

// Mock a successful response
const getAppFixture = loadFixture('apps/get-app/response.200.simple-application.json');

const handlers = [
  http.get('https://api.quickbase.com/v1/apps/:appId', () => {
    return HttpResponse.json(getAppFixture.body, {
      status: getAppFixture._meta.status,
    });
  }),
];

// Mock an error response
const errorFixture = loadFixture('_manual/errors/response.401.json');

http.get('https://api.quickbase.com/v1/apps/:appId', () => {
  return HttpResponse.json(errorFixture.body, {
    status: errorFixture._meta.status,
  });
});
```

**Go (preferred approach - inline structs):**

```go
func TestGetApp(t *testing.T) {
    // Go prefers inline struct literals for compile-time type safety
    want := App{
        ID:   "bpqe82s1",
        Name: "Test App",
    }

    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(want)
    }))
    defer server.Close()

    // Test your SDK against server.URL
}
```

**Testing Pagination:**

```typescript
// Use _manual fixtures for pagination sequences
const page1 = loadFixture('_manual/records/run-query/response.200.page1.json');
const page2 = loadFixture('_manual/records/run-query/response.200.page2.json');
const page3 = loadFixture('_manual/records/run-query/response.200.page3.json');

// Mock sequential responses for pagination tests
let callCount = 0;
http.post('https://api.quickbase.com/v1/records/query', () => {
  const fixtures = [page1, page2, page3];
  const fixture = fixtures[callCount++];
  return HttpResponse.json(fixture.body, { status: fixture._meta.status });
});
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
