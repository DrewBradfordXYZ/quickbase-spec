# QuickBase API Specification

OpenAPI 3.0 specification and test fixtures for the QuickBase JSON RESTful API.

This package is the single source of truth for QuickBase API definitions, used by:
- [quickbase-js](https://github.com/DrewBradfordXYZ/quickbase-js) - TypeScript/JavaScript SDK
- [quickbase-go](https://github.com/DrewBradfordXYZ/quickbase-go) - Go SDK (planned)

## Installation

```bash
npm install quickbase-spec
```

## Usage

### OpenAPI Spec

```typescript
import spec from 'quickbase-spec';
// or
import spec from 'quickbase-spec/openapi.json';

console.log(spec.info.title); // "QuickBase JSON RESTful API"
console.log(spec.paths); // All API endpoints
```

### Test Fixtures

Fixtures are language-agnostic JSON files for testing SDK implementations.

```typescript
import { readFileSync } from 'fs';

// Load a response fixture
const fixture = JSON.parse(
  readFileSync('node_modules/quickbase-spec/fixtures/apps/get-app/response.200.json', 'utf-8')
);

console.log(fixture._meta.status); // 200
console.log(fixture.body); // Response body
```

## Structure

```
quickbase-spec/
├── source/          # Original QuickBase Swagger 2.0 spec
├── overrides/       # Schema fixes and patches (YAML)
├── output/          # Generated OpenAPI 3.0 spec
├── fixtures/        # Test fixtures (JSON)
│   ├── apps/
│   │   └── get-app/
│   │       ├── response.200.json
│   │       ├── response.401.json
│   │       └── response.429.json
│   ├── tables/
│   ├── fields/
│   └── records/
└── tools/           # Spec processing CLI
```

## Fixture Format

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
npm run convert   # Swagger 2.0 → OpenAPI 3.0
npm run patch     # Apply fixes from overrides/
npm run validate  # Validate the spec
npm run split     # Split by tag (for editing)
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
2. Run `npm run build` to regenerate
3. Add test fixtures for new scenarios
4. Submit a PR

## Links

- [QuickBase API Portal](https://developer.quickbase.com/)
- [QuickBase API Reference](https://developer.quickbase.com/operation/getApp)

## License

MIT
