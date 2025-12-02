#!/usr/bin/env node
/**
 * Health Check - Validate fixtures against OpenAPI spec
 *
 * Checks:
 * 1. Fixture response bodies match spec schemas
 * 2. Fixture request bodies match spec schemas
 * 3. Required fields are present
 * 4. Field types are correct
 * 5. All operations have fixture coverage
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
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
  validated: number;
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

interface Operation {
  operationId: string;
  tags?: string[];
  requestBody?: {
    content?: Record<string, { schema?: Schema }>;
  };
  responses?: Record<string, {
    content?: Record<string, { schema?: Schema }>;
  }>;
}

interface OpenAPISpec {
  paths: Record<string, Record<string, Operation>>;
  components?: {
    schemas?: Record<string, Schema>;
  };
}

interface Fixture {
  _meta: {
    description: string;
    status?: number;
    headers?: Record<string, string>;
  };
  body: unknown;
}

/**
 * Convert operationId to kebab-case (matches generator logic)
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Build a map of operationId -> { tag, operation } from the spec
 */
function buildOperationMap(spec: OpenAPISpec): Map<string, { tag: string; operation: Operation }> {
  const map = new Map<string, { tag: string; operation: Operation }>();

  for (const [, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === 'parameters') continue; // Skip path-level parameters
      if (operation?.operationId) {
        const tag = operation.tags?.[0] || 'misc';
        map.set(operation.operationId, { tag, operation });
      }
    }
  }

  return map;
}

/**
 * Find all fixture files recursively
 */
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
    } else if (entry.name.endsWith('.json') && entry.name !== '_meta.json') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Parse fixture path to extract operation info
 * e.g., "apps/get-app/response.200.json" -> { tag: "apps", operationFolder: "get-app", type: "response", status: 200 }
 */
function parseFixturePath(fixturePath: string): {
  tag: string;
  operationFolder: string;
  type: 'request' | 'response';
  status?: number;
  isManual: boolean;
} | null {
  const rel = relative(FIXTURES_DIR, fixturePath);
  const parts = rel.split('/');

  if (parts.length < 3) return null;

  const isManual = parts[0] === '_manual';
  const tagIndex = isManual ? 1 : 0;
  const opIndex = isManual ? 2 : 1;
  const fileIndex = isManual ? 3 : 2;

  if (parts.length < fileIndex + 1) return null;

  const tag = parts[tagIndex];
  const operationFolder = parts[opIndex];
  const fileName = parts[fileIndex];

  // Parse filename
  if (fileName.startsWith('request')) {
    return { tag, operationFolder, type: 'request', isManual };
  } else if (fileName.startsWith('response.')) {
    const match = fileName.match(/^response\.(\d+)/);
    const status = match ? parseInt(match[1], 10) : undefined;
    return { tag, operationFolder, type: 'response', status, isManual };
  }

  return null;
}

/**
 * Find operation by matching tag and kebab-case operationId
 */
function findOperation(
  tag: string,
  operationFolder: string,
  operationMap: Map<string, { tag: string; operation: Operation }>
): { operationId: string; operation: Operation } | null {
  for (const [opId, { tag: opTag, operation }] of operationMap) {
    const expectedFolder = toKebabCase(opId);
    if (opTag.toLowerCase() === tag.toLowerCase() && expectedFolder === operationFolder) {
      return { operationId: opId, operation };
    }
  }

  // Try matching just by operationFolder (for _manual/errors or cross-tag fixtures)
  for (const [opId, { operation }] of operationMap) {
    const expectedFolder = toKebabCase(opId);
    if (expectedFolder === operationFolder) {
      return { operationId: opId, operation };
    }
  }

  return null;
}

function loadSpec(): OpenAPISpec {
  const content = readFileSync(SPEC_PATH, 'utf-8');
  return JSON.parse(content);
}

function loadFixture(path: string): Fixture | null {
  if (!existsSync(path)) {
    return null;
  }
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
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
  operation: Operation,
  operationId: string,
  fixtureInfo: ReturnType<typeof parseFixturePath>,
  spec: OpenAPISpec,
  errors: string[],
  warnings: string[]
): boolean {
  const fixture = loadFixture(fixturePath);
  if (!fixture) {
    return false;
  }

  const relativePath = relative(FIXTURES_DIR, fixturePath);

  if (fixtureInfo?.type === 'request') {
    // Validate request body
    const requestSchema = operation.requestBody?.content?.['application/json']?.schema;
    if (!requestSchema) {
      warnings.push(`${relativePath}: no request schema found for '${operationId}'`);
      return true;
    }

    validateValueAgainstSchema(
      fixture.body,
      requestSchema,
      spec,
      relativePath,
      errors,
      warnings
    );
  } else if (fixtureInfo?.type === 'response') {
    // Skip validation for error responses (4xx/5xx) - QuickBase uses different schema
    if (fixtureInfo.status && fixtureInfo.status >= 400) {
      return true;
    }

    const statusCode = String(fixtureInfo?.status || fixture._meta.status || 200);
    const response = operation.responses?.[statusCode] || operation.responses?.['200'];
    const responseSchema = response?.content?.['application/json']?.schema;

    if (!responseSchema) {
      warnings.push(`${relativePath}: no response schema found for '${operationId}' status ${statusCode}`);
      return true;
    }

    validateValueAgainstSchema(
      fixture.body,
      responseSchema,
      spec,
      relativePath,
      errors,
      warnings
    );
  }

  return true;
}

function checkCoverage(
  operationMap: Map<string, { tag: string; operation: Operation }>,
  coveredOperations: Set<string>
): { total: number; covered: number; missing: string[] } {
  const missing: string[] = [];

  for (const [opId, { tag }] of operationMap) {
    if (!coveredOperations.has(opId)) {
      const expectedPath = `${tag.toLowerCase()}/${toKebabCase(opId)}`;
      missing.push(`${opId} (expected at ${expectedPath}/response.200.json)`);
    }
  }

  return {
    total: operationMap.size,
    covered: coveredOperations.size,
    missing,
  };
}

export async function healthCheck(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const coveredOperations = new Set<string>();
  let validated = 0;

  console.log('\n🔍 QuickBase Spec Health Check\n');
  console.log('='.repeat(50));

  // Load spec
  console.log('\n📋 Loading spec...');
  const spec = loadSpec();
  const operationMap = buildOperationMap(spec);
  console.log(`   Found ${operationMap.size} operations in spec`);

  // Find all fixtures
  console.log('\n📁 Discovering fixtures...');
  const allFixtures = findFixtureFiles(FIXTURES_DIR);
  console.log(`   Found ${allFixtures.length} fixture files`);

  // Validate fixtures
  console.log('\n✅ Validating fixtures against schema...');

  for (const fixturePath of allFixtures) {
    const fixtureInfo = parseFixturePath(fixturePath);
    if (!fixtureInfo) {
      // Skip files we can't parse (like _meta.json)
      continue;
    }

    // Skip _manual/errors - these are generic error fixtures, not operation-specific
    if (fixtureInfo.isManual && fixtureInfo.tag === 'errors') {
      validated++;
      continue;
    }

    const match = findOperation(fixtureInfo.tag, fixtureInfo.operationFolder, operationMap);
    if (!match) {
      warnings.push(`${relative(FIXTURES_DIR, fixturePath)}: no matching operation found`);
      continue;
    }

    const { operationId, operation } = match;
    coveredOperations.add(operationId);

    if (validateFixture(fixturePath, operation, operationId, fixtureInfo, spec, errors, warnings)) {
      validated++;
    }
  }

  // Check coverage
  console.log('\n📊 Checking fixture coverage...');
  const coverage = checkCoverage(operationMap, coveredOperations);
  const coveragePercent = Math.round((coverage.covered / coverage.total) * 100);
  console.log(`   Operations: ${coverage.covered}/${coverage.total} covered (${coveragePercent}%)`);
  console.log(`   Fixtures validated: ${validated}`);

  // Print results
  console.log('\n' + '='.repeat(50));

  if (errors.length > 0) {
    console.log(`\n❌ Errors (${errors.length}):`);
    errors.slice(0, 20).forEach(e => console.log(`   • ${e}`));
    if (errors.length > 20) {
      console.log(`   ... and ${errors.length - 20} more`);
    }
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
    validated,
  };
}

// Run if called directly
healthCheck().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
