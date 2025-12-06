/**
 * Patch the OpenAPI spec with our fixes and overrides
 *
 * Applies corrections to the official QuickBase spec:
 * - Remove internal headers (QB-Realm-Hostname, Authorization, User-Agent)
 * - Fix incorrect schema types
 * - Add missing descriptions
 * - Correct response types (arrays vs objects)
 */

import { readJson, writeJson, PATHS, log, runTask } from './common.js';
import { join, basename } from 'path';
import { existsSync, readdirSync } from 'fs';

interface OpenAPISpec {
  openapi: string;
  info: Record<string, unknown>;
  paths: Record<string, PathItem>;
  components: {
    schemas?: Record<string, Schema>;
    parameters?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
  parameters?: Parameter[];
}

interface Operation {
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  tags?: string[];
}

interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: Schema;
}

interface RequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, { schema: Schema }>;
}

interface Response {
  description: string;
  content?: Record<string, { schema: Schema }>;
}

interface Schema {
  type?: string;
  $ref?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  required?: string[];
  description?: string;
  example?: unknown;
  enum?: (string | number | boolean)[];
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
}

/** Headers that should be removed (handled by SDK internally) */
const INTERNAL_HEADERS = [
  'QB-Realm-Hostname',
  'Authorization',
  'User-Agent',
  'Content-Type',
];

/** Operations that have record data arrays that need proper typing */
const RECORD_DATA_OPERATIONS = [
  'upsert',
  'runQuery',
  'runReport',
];

/** Operations that require a request body (QuickBase spec incorrectly marks these as optional) */
const REQUIRED_BODY_OPERATIONS = [
  'upsert',
  'deleteRecords',
  'runQuery',
  'runFormula',
  'createApp',
  'deleteApp',
  'copyApp',
  'createTable',
  'createField',
  'deleteFields',
  'createRelationship',
  'audit',
  'exchangeSsoToken',
  'cloneUserToken',
  'transferUserToken',
  'denyUsers',
  'denyUsersAndGroups',
  'undenyUsers',
  'addMembersToGroup',
  'removeMembersFromGroup',
  'addManagersToGroup',
  'removeManagersFromGroup',
  'addSubgroupsToGroup',
  'removeSubgroupsFromGroup',
  'createSolution',
  'changesetSolution',
];

/**
 * Remove internal headers from operation parameters
 */
function removeInternalHeaders(operation: Operation): void {
  if (operation.parameters) {
    operation.parameters = operation.parameters.filter(
      (p) => p.in !== 'header' || !INTERNAL_HEADERS.includes(p.name)
    );
  }
}

/**
 * Normalize non-standard response codes to valid HTTP status codes
 * QuickBase spec uses patterns like "401/403" and "4xx/5xx" which aren't valid
 */
function normalizeResponseCodes(operation: Operation): void {
  if (!operation.responses) return;

  const responses = operation.responses as Record<string, Response>;
  const keysToRename: Array<{ old: string; new: string }> = [];

  for (const code of Object.keys(responses)) {
    // Handle "401/403" -> keep 401, discard 403 (they're usually the same error response)
    if (code === '401/403') {
      keysToRename.push({ old: code, new: '401' });
    }
    // Handle "4xx/5xx" -> use "default" for catch-all error responses
    else if (code === '4xx/5xx' || code === '4xx' || code === '5xx') {
      keysToRename.push({ old: code, new: 'default' });
    }
  }

  for (const { old, new: newKey } of keysToRename) {
    if (!responses[newKey]) {
      responses[newKey] = responses[old];
    }
    delete responses[old];
    log('info', `Normalized response code "${old}" -> "${newKey}" in ${operation.operationId}`);
  }
}

/**
 * Apply patches to a single operation
 */
function patchOperation(operation: Operation, path: string, method: string): void {
  removeInternalHeaders(operation);
  normalizeResponseCodes(operation);

  // Ensure operationId is set
  if (!operation.operationId) {
    // Generate from path: /apps/{appId} GET -> getApp
    const parts = path.split('/').filter(Boolean);
    const baseName = parts
      .map((p) => (p.startsWith('{') ? '' : p))
      .filter(Boolean)
      .join('');

    const methodPrefix = method === 'get' ? 'get' : method === 'post' ? 'create' : method;
    operation.operationId = methodPrefix + baseName.charAt(0).toUpperCase() + baseName.slice(1);
  }

  // Fix incorrectly optional request bodies
  if (
    operation.requestBody &&
    REQUIRED_BODY_OPERATIONS.includes(operation.operationId)
  ) {
    operation.requestBody.required = true;
  }
}

/**
 * Add QuickbaseRecord and FieldValue schemas for properly typed record data
 */
function addRecordSchemas(spec: OpenAPISpec): void {
  if (!spec.components.schemas) {
    spec.components.schemas = {};
  }

  // Add FieldValue schema
  spec.components.schemas['FieldValue'] = {
    type: 'object',
    description: 'A field value in a QuickBase record. The value type depends on the field type.',
    properties: {
      value: {
        description: 'The field value. Type depends on field type: string (text, email, URL, date), number (numeric fields), boolean (checkbox), string[] (multi-select), or object[] (file attachments).',
        oneOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' },
          { type: 'array', items: { type: 'string' } },
          {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'File attachment ID' },
              },
            },
          },
        ],
      },
    },
    required: ['value'],
  };

  // Add QuickbaseRecord schema
  spec.components.schemas['QuickbaseRecord'] = {
    type: 'object',
    description: 'A QuickBase record where keys are field IDs (as strings) and values are FieldValue objects.',
    additionalProperties: {
      $ref: '#/components/schemas/FieldValue',
    },
  };

  log('info', 'Added FieldValue and QuickbaseRecord schemas');
}

/**
 * Patch data arrays to use QuickbaseRecord type
 */
function patchRecordDataArrays(spec: OpenAPISpec): void {
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
      const operation = pathItem[method];
      if (!operation || !RECORD_DATA_OPERATIONS.includes(operation.operationId)) {
        continue;
      }

      // Patch request body data array (for upsert)
      if (operation.requestBody?.content?.['application/json']?.schema?.properties?.data) {
        const dataSchema = operation.requestBody.content['application/json'].schema.properties.data;
        if (dataSchema.type === 'array' && !dataSchema.items) {
          dataSchema.items = { $ref: '#/components/schemas/QuickbaseRecord' };
          log('info', `Patched ${operation.operationId} request data array`);
        }
      }

      // Patch response data array (for runQuery, runReport, upsert)
      const response = operation.responses?.['200'];
      if (response?.content?.['application/json']?.schema?.properties?.data) {
        const dataSchema = response.content['application/json'].schema.properties.data;
        if (dataSchema.type === 'array' && !dataSchema.items) {
          dataSchema.items = { $ref: '#/components/schemas/QuickbaseRecord' };
          log('info', `Patched ${operation.operationId} response data array`);
        }
      }
    }
  }
}

/**
 * Add SortField schema for sortBy arrays
 */
function addSortFieldSchema(spec: OpenAPISpec): void {
  if (!spec.components.schemas) {
    spec.components.schemas = {};
  }

  spec.components.schemas['SortField'] = {
    type: 'object',
    description: 'A field to sort by in a query.',
    properties: {
      fieldId: {
        type: 'integer',
        description: 'The unique identifier of a field in a table.',
      },
      order: {
        type: 'string',
        enum: ['ASC', 'DESC', 'equal-values'],
        description: 'Sort based on ascending order (ASC), descending order (DESC) or equal values (equal-values).',
      },
    },
    required: ['fieldId', 'order'],
  };

  // Add SortByUnion schema - a union type that can be an array of SortField or false
  // This is a component schema so oapi-codegen generates proper From*/As* helper methods
  spec.components.schemas['SortByUnion'] = {
    description: 'An array of field IDs and sort directions. Set to false to disable sorting for better performance.',
    oneOf: [
      {
        type: 'array',
        items: { $ref: '#/components/schemas/SortField' },
      },
      {
        type: 'boolean',
        enum: [false],
      },
    ],
  };

  log('info', 'Added SortField and SortByUnion schemas');
}

/**
 * Fix invalid type values (e.g., "int" -> "integer")
 * QuickBase's spec incorrectly uses "int" which is not valid JSON Schema
 */
function fixInvalidTypes(obj: unknown, path: string = ''): void {
  if (!obj || typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;

  // Fix "type": "int" -> "type": "integer"
  if (record.type === 'int') {
    record.type = 'integer';
    log('info', `Fixed type "int" -> "integer" at ${path}`);
  }

  // Recurse into nested objects
  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === 'object') {
      fixInvalidTypes(value, path ? `${path}.${key}` : key);
    }
  }
}

/**
 * Recursively patch array schemas that are missing items
 */
function patchArraySchemas(obj: unknown, path: string = ''): void {
  if (!obj || typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;

  // Check if this is a schema with type: array and no items
  if (record.type === 'array' && !record.items) {
    const propName = path.split('.').pop() || '';

    // Patch based on property name
    if (propName === 'select' || propName === 'fieldsToReturn') {
      record.items = { type: 'integer' };
      log('info', `Patched ${path} to integer[]`);
    } else if (propName === 'choicesLuid') {
      record.items = { type: 'string' };
      log('info', `Patched ${path} to string[]`);
    } else if (propName === 'compositeFields') {
      // Could be field IDs or objects - allow both
      record.items = { oneOf: [{ type: 'integer' }, { type: 'object' }] };
      log('info', `Patched ${path} to (number | object)[]`);
    }
  }

  // Handle sortBy with x-amf-union (non-standard OpenAPI extension)
  // Use a $ref to the SortByUnion component schema so oapi-codegen generates proper helper methods
  if (record['x-amf-union'] && path.endsWith('.sortBy')) {
    delete record['x-amf-union'];
    // Keep description if present, but replace with $ref
    const description = record.description;
    // Clear all existing properties except description
    for (const key of Object.keys(record)) {
      if (key !== 'description') {
        delete record[key];
      }
    }
    record.$ref = '#/components/schemas/SortByUnion';
    if (description) {
      // Note: $ref with sibling properties is technically not valid in OpenAPI 3.0
      // but oapi-codegen handles it. In 3.1 it's supported via allOf wrapper.
      // For now we just use $ref and let the schema description carry through.
      delete record.description;
    }
    log('info', `Patched ${path} sortBy to use SortByUnion $ref`);
  }

  // Handle lineErrors - should be Record<string, string[]>
  if (path.endsWith('.lineErrors') && record.type === 'object' && record.additionalProperties === true) {
    record.additionalProperties = {
      type: 'array',
      items: { type: 'string' },
    };
    log('info', `Patched ${path} to Record<string, string[]>`);
  }

  // Recurse into nested objects
  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === 'object') {
      patchArraySchemas(value, path ? `${path}.${key}` : key);
    }
  }
}

/**
 * Fix known schema issues
 */
function patchSchemas(spec: OpenAPISpec): void {
  const schemas = spec.components.schemas || {};

  // Fix common issues
  for (const [name, schema] of Object.entries(schemas)) {
    // Remove overly permissive additionalProperties
    if (schema.additionalProperties === true && schema.properties) {
      // Keep additionalProperties only if it's explicitly needed
      // For most QuickBase responses, it's not needed
    }

    // Ensure all schemas have descriptions
    if (!schema.description && schema.type === 'object') {
      schema.description = `${name} object`;
    }
  }
}

/**
 * Apply endpoint-specific patches
 */
function applyEndpointPatches(spec: OpenAPISpec): void {
  const patches: Record<string, (op: Operation) => void> = {
    // getFields returns an array, not wrapped in an object
    getFields: (op) => {
      // This should be an array of Field objects
      if (op.responses?.['200']?.content?.['application/json']?.schema) {
        const schema = op.responses['200'].content['application/json'].schema;
        // If it's not already an array, wrap it
        if (schema.type !== 'array' && !schema.$ref?.includes('Array')) {
          log('info', 'Patching getFields response to array');
        }
      }
    },

    // getAppTables returns an array
    getAppTables: (op) => {
      // Similar fix
    },

    // runQuery data field should be an array of record objects, not strings
    runQuery: (op) => {
      // The data field in the response is often incorrectly typed
    },

    // platformAnalyticEventSummaries has 'totals' incorrectly required in results items
    // The example shows totals at root level, not inside each result item
    platformAnalyticEventSummaries: (op) => {
      const schema = op.responses?.['200']?.content?.['application/json']?.schema;
      if (schema?.properties?.results?.items?.required) {
        const required = schema.properties.results.items.required as string[];
        const idx = required.indexOf('totals');
        if (idx !== -1) {
          required.splice(idx, 1);
          log('info', 'Removed totals from platformAnalyticEventSummaries results[].required');
        }
      }
    },
  };

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
      const operation = pathItem[method];
      if (operation && operation.operationId && patches[operation.operationId]) {
        patches[operation.operationId](operation);
      }
    }
  }
}

/**
 * Load and merge override files
 */
async function loadOverrides(): Promise<{
  schemas?: Record<string, Schema>;
  parameters?: Record<string, unknown>;
  patches?: Record<string, unknown>;
}> {
  const overridesDir = PATHS.overrides;
  const overrides: ReturnType<typeof loadOverrides> extends Promise<infer T> ? T : never = {};

  if (!existsSync(overridesDir)) {
    return overrides;
  }

  const files = readdirSync(overridesDir).filter(
    (f) => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml')
  );

  for (const file of files) {
    const filePath = join(overridesDir, file);
    const name = basename(file, file.endsWith('.json') ? '.json' : '.yaml');

    try {
      let content: unknown;
      if (file.endsWith('.json')) {
        content = readJson(filePath);
      } else {
        const yaml = await import('yaml');
        const { readFileSync } = await import('fs');
        content = yaml.parse(readFileSync(filePath, 'utf-8'));
      }

      if (name === 'schemas') {
        overrides.schemas = content as Record<string, Schema>;
      } else if (name === 'parameters') {
        overrides.parameters = content as Record<string, unknown>;
      } else if (name === 'patches') {
        overrides.patches = content as Record<string, unknown>;
      }

      log('info', `Loaded override: ${file}`);
    } catch (error) {
      log('warn', `Failed to load override ${file}: ${error}`);
    }
  }

  return overrides;
}

/**
 * Merge overrides into spec
 */
function mergeOverrides(
  spec: OpenAPISpec,
  overrides: Awaited<ReturnType<typeof loadOverrides>>
): void {
  // Merge schemas
  if (overrides.schemas) {
    spec.components.schemas = {
      ...spec.components.schemas,
      ...overrides.schemas,
    };
    log('info', `Merged ${Object.keys(overrides.schemas).length} schema overrides`);
  }

  // Merge parameters
  if (overrides.parameters) {
    spec.components.parameters = {
      ...spec.components.parameters,
      ...overrides.parameters,
    };
  }
}

/**
 * Main patch function
 */
export async function patch(inputPath?: string): Promise<void> {
  await runTask('Patch OpenAPI spec', async () => {
    // Find input file
    const input = inputPath || join(PATHS.output, 'quickbase-openapi3.json');

    if (!existsSync(input)) {
      throw new Error(`Input file not found: ${input}`);
    }

    // Read spec
    const spec = readJson<OpenAPISpec>(input);

    // Load overrides
    const overrides = await loadOverrides();

    // Apply patches to all operations
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
        const operation = pathItem[method];
        if (operation) {
          patchOperation(operation, path, method);
        }
      }
    }

    // Add QuickbaseRecord and FieldValue schemas
    addRecordSchemas(spec);

    // Add SortField schema for sortBy
    addSortFieldSchema(spec);

    // Patch data arrays to use QuickbaseRecord
    patchRecordDataArrays(spec);

    // Fix invalid type values ("int" -> "integer")
    fixInvalidTypes(spec.paths, 'paths');

    // Patch other array schemas (select, sortBy, choicesLuid, etc.)
    patchArraySchemas(spec.paths, 'paths');

    // Patch schemas
    patchSchemas(spec);

    // Apply endpoint-specific patches
    applyEndpointPatches(spec);

    // Merge overrides
    mergeOverrides(spec, overrides);

    // Write output
    const outputPath = join(PATHS.output, 'quickbase-patched.json');
    writeJson(outputPath, spec);

    log('info', `Wrote patched spec to: ${outputPath}`);
  });
}
