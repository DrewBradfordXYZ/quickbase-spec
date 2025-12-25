# QuickBase SDK Development Guide

This document provides guidance for AI assistants and developers building SDKs from the QuickBase OpenAPI specification.

## Quick Start

For SDK generation, use these files in order of preference:

1. **`output/operations.json`** - Lightweight summary with all essential info
2. **`output/quickbase-patched.json`** - Full OpenAPI 3.0 spec (patched for correctness)
3. **`output/OPERATIONS.md`** - Human-readable operation reference

## operations.json Structure

The `operations.json` file contains a compact summary of all 59 API operations:

```json
{
  "operations": [...],
  "byTag": {
    "Apps": [...],
    "Tables": [...],
    ...
  }
}
```

### Operation Fields

| Field | Type | Description |
|-------|------|-------------|
| `operationId` | string | Unique identifier (e.g., `createApp`, `runQuery`) |
| `method` | string | HTTP method (`GET`, `POST`, `PUT`, `DELETE`) |
| `path` | string | URL path with placeholders (e.g., `/apps/{appId}`) |
| `summary` | string | Brief description |
| `tags` | string[] | Categories (e.g., `["Apps"]`) |
| `pathParams` | string[] | URL path parameters |
| `queryParams` | string[] | Query string parameters |
| `hasRequestBody` | boolean | Whether operation accepts a request body |
| `requestBodyRequired` | boolean | Whether request body is required |
| `requiredFields` | string[] | Required request body fields |
| `optionalFields` | string[] | Optional request body fields |
| `responseType` | string | Response schema type (e.g., `object`, `[]object`) |
| `responseIsArray` | boolean | Whether response is an array |

## SDK Generation Patterns

### Builder Pattern

Most operations benefit from a fluent builder pattern:

```go
// Go example
result, err := client.CreateApp("My App").
    Description("App description").
    AssignToken(true).
    Run(ctx)
```

```typescript
// TypeScript example
const result = await client.createApp("My App")
    .description("App description")
    .assignToken(true)
    .run();
```

### Constructor Parameters

Use these rules for constructor parameters:

| Pattern | Constructor Params | Example |
|---------|-------------------|---------|
| Create in container | Container ID | `CreateTable(appId)` |
| Operate on resource | Resource ID | `UpdateApp(appId)` |
| Resource in container | Both IDs | `UpdateField(tableId, fieldId)` |
| Query/modify records | Table ID | `RunQuery(tableId)` |
| Create top-level | None or name | `CreateApp()` or `CreateApp(name)` |

### Key Operations

| Operation | Purpose | Key Parameters |
|-----------|---------|----------------|
| `runQuery` | Query records | `from` (tableId), `select`, `where`, `sortBy` |
| `upsert` | Insert/update records | `to` (tableId), `data`, `mergeFieldId` |
| `deleteRecords` | Delete records | `from` (tableId), `where` |
| `getFields` | List table fields | `tableId` |
| `createField` | Create a field | `tableId`, `fieldType`, `label` |

### Pagination

These operations support pagination:

- `runQuery` - uses `skip` in `options`
- `runReport` - uses `skip` query parameter

Pagination metadata:
```json
{
  "totalRecords": 1000,
  "numRecords": 100,
  "skip": 0
}
```

### Response Transformation

For better UX, consider transforming responses:

1. **Dereference pointers** - Convert optional pointer fields to values with defaults
2. **Flatten nested objects** - Extract commonly used nested fields
3. **Simplify arrays** - Extract key fields from complex array elements

Example transformations:
- `getApp`: Dereference `id`, `description`, `created`, `updated`
- `upsert`: Flatten `metadata.createdRecordIds` to `createdRecordIDs`
- `getFields`: Extract `id`, `label`, `fieldType` from each field

## Common Patterns in QuickBase API

### Table/Field References

Parameters that reference tables:
- `from` (runQuery, deleteRecords)
- `to` (upsert)
- `tableId` (most field/report operations)
- `childTableId`, `parentTableId` (relationships)

Parameters that reference fields:
- `select` (array of field IDs)
- `fieldsToReturn` (array of field IDs)
- `mergeFieldId` (single field ID)
- `sortBy[].fieldId`, `groupBy[].fieldId` (nested field references)

### Record Format

Records use field IDs as keys with wrapped values:

```json
{
  "6": {"value": "text value"},
  "7": {"value": 42},
  "8": {"value": true}
}
```

### Where Clause Syntax

QuickBase uses a custom query syntax:
```
{fieldId.operator.value}
```

Examples:
- `{6.EX.'active'}` - field 6 equals 'active'
- `{7.GT.100}` - field 7 greater than 100
- `{6.EX.'active'}AND{7.GT.100}` - compound query

## Files Overview

| File | Purpose |
|------|---------|
| `source/quickbase-swagger.json` | Original QuickBase Swagger 2.0 spec |
| `output/quickbase-openapi3.json` | Converted to OpenAPI 3.0 |
| `output/quickbase-patched.json` | Patched for code generation |
| `output/operations.json` | Compact operation summary |
| `output/OPERATIONS.md` | Human-readable reference |

## Patches Applied

The patched spec includes these fixes:

1. **Response type normalization** - Converts `401/403` to standard codes
2. **Array type fixes** - Ensures consistent array schemas
3. **Type corrections** - Fixes `int` to `integer` for OpenAPI compliance
4. **Custom schemas** - Adds `FieldValue`, `QuickbaseRecord`, `SortByUnion`
5. **lineErrors fix** - Corrects the type to `Record<string, string[]>`

## Building the Spec

```bash
npm install
npm run build
```

This runs the full pipeline: convert → patch → validate → summarize
