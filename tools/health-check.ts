#!/usr/bin/env node
/**
 * Health Check - Validate fixtures against OpenAPI spec
 *
 * Checks:
 * 1. Fixture response bodies match spec schemas
 * 2. Required fields are present
 * 3. Field types are correct
 * 4. All operations have fixture coverage
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
const SPEC_PATH = join(__dirname, '..', 'output', 'quickbase-patched.json');

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  coverage: {
    total: number;
    covered: number;
    missing: string[];
  };
}

interface Schema {
  type?: string;
  $ref?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
}

interface OpenAPISpec {
  paths: Record<string, Record<string, {
    operationId: string;
    responses?: Record<string, {
      content?: Record<string, { schema?: Schema }>;
    }>;
  }>>;
  components?: {
    schemas?: Record<string, Schema>;
  };
}

interface Fixture {
  _meta: {
    description: string;
    status: number;
    headers?: Record<string, string>;
  };
  body: unknown;
}

// Map operation IDs to fixture paths
const OPERATION_TO_FIXTURE: Record<string, string> = {
  getApp: 'apps/get-app',
  createApp: 'apps/create-app',
  updateApp: 'apps/update-app',
  deleteApp: 'apps/delete-app',
  copyApp: 'apps/copy-app',
  getAppTables: 'apps/get-app-tables',
  getAppEvents: 'apps/get-app-events',
  getTable: 'tables/get-table',
  createTable: 'tables/create-table',
  updateTable: 'tables/update-table',
  deleteTable: 'tables/delete-table',
  getFields: 'fields/get-fields',
  getField: 'fields/get-field',
  createField: 'fields/create-field',
  updateField: 'fields/update-field',
  deleteFields: 'fields/delete-fields',
  runQuery: 'records/run-query',
  upsert: 'records/upsert',
  deleteRecords: 'records/delete-records',
  getReport: 'reports/get-report',
  getTableReports: 'reports/get-table-reports',
  runReport: 'reports/run-report',
  getUsers: 'users/get-users',
  denyUsers: 'users/deny-users',
  undenyUsers: 'users/undeny-users',
  getTempTokenDBID: 'auth/get-temp-token',
  exchangeSsoToken: 'auth/exchange-sso-token',
};

function loadSpec(): OpenAPISpec {
  const content = readFileSync(SPEC_PATH, 'utf-8');
  return JSON.parse(content);
}

function loadFixture(path: string): Fixture | null {
  const fullPath = join(FIXTURES_DIR, path);
  if (!existsSync(fullPath)) {
    return null;
  }
  const content = readFileSync(fullPath, 'utf-8');
  return JSON.parse(content);
}

function findFixtureFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFixtureFiles(fullPath));
    } else if (entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
      files.push(fullPath);
    }
  }

  return files;
}

function resolveRef(ref: string, spec: OpenAPISpec): Schema | null {
  const parts = ref.replace('#/', '').split('/');
  let current: unknown = spec;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  return current as Schema;
}

function getTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateValueAgainstSchema(
  value: unknown,
  schema: Schema,
  spec: OpenAPISpec,
  path: string,
  errors: string[],
  warnings: string[]
): void {
  // Handle $ref
  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, spec);
    if (resolved) {
      validateValueAgainstSchema(value, resolved, spec, path, errors, warnings);
    }
    return;
  }

  // Handle oneOf/anyOf/allOf
  if (schema.oneOf || schema.anyOf) {
    const schemas = schema.oneOf || schema.anyOf || [];
    const matches = schemas.some(s => {
      const tempErrors: string[] = [];
      validateValueAgainstSchema(value, s, spec, path, tempErrors, []);
      return tempErrors.length === 0;
    });
    if (!matches && schemas.length > 0) {
      warnings.push(`${path}: value doesn't match any of the expected schemas`);
    }
    return;
  }

  if (schema.allOf) {
    for (const s of schema.allOf) {
      validateValueAgainstSchema(value, s, spec, path, errors, warnings);
    }
    return;
  }

  const actualType = getTypeOf(value);

  // Type checking
  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const normalizedExpected = expectedTypes.map(t =>
      t === 'integer' || t === 'int' ? 'number' : t
    );

    if (!normalizedExpected.includes(actualType)) {
      // Allow null for optional fields
      if (actualType !== 'null') {
        errors.push(`${path}: expected ${schema.type}, got ${actualType}`);
      }
      return;
    }
  }

  // Array items
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      validateValueAgainstSchema(item, schema.items!, spec, `${path}[${index}]`, errors, warnings);
    });
  }

  // Object properties
  if (schema.type === 'object' && typeof value === 'object' && value !== null && schema.properties) {
    const obj = value as Record<string, unknown>;

    // Check required fields
    if (schema.required) {
      for (const req of schema.required) {
        if (!(req in obj)) {
          errors.push(`${path}: missing required field '${req}'`);
        }
      }
    }

    // Validate each property
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        validateValueAgainstSchema(obj[key], propSchema, spec, `${path}.${key}`, errors, warnings);
      }
    }

    // Check for unknown fields (warning only)
    if (!schema.additionalProperties) {
      for (const key of Object.keys(obj)) {
        if (!(key in schema.properties)) {
          warnings.push(`${path}.${key}: field not defined in schema (may be undocumented)`);
        }
      }
    }
  }
}

function validateFixture(
  fixturePath: string,
  operationId: string,
  spec: OpenAPISpec,
  errors: string[],
  warnings: string[]
): void {
  const fixture = loadFixture(fixturePath);
  if (!fixture) {
    return;
  }

  // Skip validation for error responses (non-2xx) - QuickBase uses different schema for errors
  if (fixture._meta.status >= 300) {
    return;
  }

  // Find the operation in the spec
  let responseSchema: Schema | undefined;

  for (const [, methods] of Object.entries(spec.paths)) {
    for (const [, operation] of Object.entries(methods)) {
      if (operation.operationId === operationId) {
        const statusCode = String(fixture._meta.status);
        const response = operation.responses?.[statusCode] || operation.responses?.['200'];
        responseSchema = response?.content?.['application/json']?.schema;
        break;
      }
    }
  }

  if (!responseSchema) {
    warnings.push(`${fixturePath}: no schema found for operation '${operationId}'`);
    return;
  }

  validateValueAgainstSchema(
    fixture.body,
    responseSchema,
    spec,
    `${basename(fixturePath)}`,
    errors,
    warnings
  );
}

function checkCoverage(spec: OpenAPISpec): { total: number; covered: number; missing: string[] } {
  const allOperations: string[] = [];

  for (const [, methods] of Object.entries(spec.paths)) {
    for (const [, operation] of Object.entries(methods)) {
      if (operation.operationId) {
        allOperations.push(operation.operationId);
      }
    }
  }

  const missing: string[] = [];
  let covered = 0;

  for (const opId of allOperations) {
    const fixturePath = OPERATION_TO_FIXTURE[opId];
    if (fixturePath) {
      const fullPath = join(FIXTURES_DIR, fixturePath, 'response.200.json');
      if (existsSync(fullPath)) {
        covered++;
      } else {
        missing.push(`${opId} (expected at ${fixturePath}/response.200.json)`);
      }
    } else {
      missing.push(`${opId} (no fixture mapping defined)`);
    }
  }

  return {
    total: allOperations.length,
    covered,
    missing,
  };
}

export async function healthCheck(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n🔍 QuickBase Spec Health Check\n');
  console.log('='.repeat(50));

  // Load spec
  console.log('\n📋 Loading spec...');
  const spec = loadSpec();

  // Check coverage
  console.log('\n📊 Checking fixture coverage...');
  const coverage = checkCoverage(spec);
  console.log(`   Operations: ${coverage.covered}/${coverage.total} covered (${Math.round(coverage.covered/coverage.total*100)}%)`);

  // Validate fixtures
  console.log('\n✅ Validating fixtures against schema...');

  for (const [opId, fixturePath] of Object.entries(OPERATION_TO_FIXTURE)) {
    const dir = join(FIXTURES_DIR, fixturePath);
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir).filter(f => f.startsWith('response.') && f.endsWith('.json'));
    for (const file of files) {
      const relativePath = join(fixturePath, file);
      validateFixture(relativePath, opId, spec, errors, warnings);
    }
  }

  // Print results
  console.log('\n' + '='.repeat(50));

  if (errors.length > 0) {
    console.log(`\n❌ Errors (${errors.length}):`);
    errors.forEach(e => console.log(`   • ${e}`));
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    warnings.slice(0, 20).forEach(w => console.log(`   • ${w}`));
    if (warnings.length > 20) {
      console.log(`   ... and ${warnings.length - 20} more`);
    }
  }

  if (coverage.missing.length > 0 && coverage.missing.length <= 20) {
    console.log(`\n📝 Missing fixtures (${coverage.missing.length}):`);
    coverage.missing.forEach(m => console.log(`   • ${m}`));
  } else if (coverage.missing.length > 20) {
    console.log(`\n📝 Missing fixtures: ${coverage.missing.length} operations without fixtures`);
  }

  const valid = errors.length === 0;
  console.log('\n' + '='.repeat(50));
  console.log(valid ? '\n✅ Health check passed!\n' : '\n❌ Health check failed!\n');

  return {
    valid,
    errors,
    warnings,
    coverage,
  };
}

// Run if called directly
healthCheck().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
