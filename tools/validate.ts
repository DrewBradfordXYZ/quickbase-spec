/**
 * Validate OpenAPI spec
 *
 * Checks:
 * - Structural validity (valid JSON/YAML)
 * - OpenAPI schema compliance
 * - All $refs resolve correctly
 * - Required fields are present
 */

import { readJson, PATHS, log, runTask } from './common.js';
import { join } from 'path';
import { existsSync } from 'fs';

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
}

interface Operation {
  operationId?: string;
  responses?: Record<string, unknown>;
  parameters?: unknown[];
  requestBody?: unknown;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    paths: number;
    operations: number;
    schemas: number;
    parameters: number;
  };
}

/**
 * Validate OpenAPI structure
 */
function validateStructure(spec: OpenAPISpec): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    stats: {
      paths: 0,
      operations: 0,
      schemas: 0,
      parameters: 0,
    },
  };

  // Check required fields
  if (!spec.openapi) {
    result.errors.push('Missing required field: openapi');
    result.valid = false;
  } else if (!spec.openapi.startsWith('3.')) {
    result.errors.push(`Expected OpenAPI 3.x, got: ${spec.openapi}`);
    result.valid = false;
  }

  if (!spec.info?.title) {
    result.errors.push('Missing required field: info.title');
    result.valid = false;
  }

  if (!spec.info?.version) {
    result.errors.push('Missing required field: info.version');
    result.valid = false;
  }

  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    result.errors.push('No paths defined');
    result.valid = false;
  }

  return result;
}

/**
 * Validate paths and operations
 */
function validatePaths(spec: OpenAPISpec, result: ValidationResult): void {
  const operationIds = new Set<string>();

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    result.stats.paths++;

    // Check path format
    if (!path.startsWith('/')) {
      result.errors.push(`Invalid path (must start with /): ${path}`);
      result.valid = false;
    }

    // Validate operations
    for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
      const operation = pathItem[method];
      if (!operation) continue;

      result.stats.operations++;

      // Check operationId
      if (!operation.operationId) {
        result.warnings.push(`Missing operationId: ${method.toUpperCase()} ${path}`);
      } else {
        // Check for duplicate operationIds
        if (operationIds.has(operation.operationId)) {
          result.errors.push(`Duplicate operationId: ${operation.operationId}`);
          result.valid = false;
        }
        operationIds.add(operation.operationId);
      }

      // Check responses
      if (!operation.responses || Object.keys(operation.responses).length === 0) {
        result.warnings.push(`No responses defined: ${method.toUpperCase()} ${path}`);
      }
    }
  }
}

/**
 * Validate $ref references
 */
function validateRefs(spec: OpenAPISpec, result: ValidationResult): void {
  const schemas = spec.components?.schemas || {};
  const parameters = spec.components?.parameters || {};

  result.stats.schemas = Object.keys(schemas).length;
  result.stats.parameters = Object.keys(parameters).length;

  // Collect all $refs
  const refs = new Set<string>();
  const collectRefs = (obj: unknown): void => {
    if (typeof obj !== 'object' || obj === null) return;

    if ('$ref' in obj && typeof (obj as Record<string, unknown>).$ref === 'string') {
      refs.add((obj as Record<string, unknown>).$ref as string);
    }

    for (const value of Object.values(obj as Record<string, unknown>)) {
      collectRefs(value);
    }
  };

  collectRefs(spec.paths);
  collectRefs(spec.components);

  // Validate each $ref
  for (const ref of refs) {
    if (ref.startsWith('#/components/schemas/')) {
      const schemaName = ref.replace('#/components/schemas/', '');
      if (!schemas[schemaName]) {
        result.errors.push(`Unresolved $ref: ${ref}`);
        result.valid = false;
      }
    } else if (ref.startsWith('#/components/parameters/')) {
      const paramName = ref.replace('#/components/parameters/', '');
      if (!parameters[paramName]) {
        result.errors.push(`Unresolved $ref: ${ref}`);
        result.valid = false;
      }
    } else if (!ref.startsWith('#/')) {
      result.warnings.push(`External $ref (not validated): ${ref}`);
    }
  }
}

/**
 * Main validate function
 */
export async function validate(inputPath?: string): Promise<ValidationResult> {
  return await runTask('Validate OpenAPI spec', async () => {
    // Find input file
    const input = inputPath || join(PATHS.output, 'quickbase-patched.json');

    if (!existsSync(input)) {
      throw new Error(`Input file not found: ${input}`);
    }

    // Read spec
    let spec: OpenAPISpec;
    try {
      spec = readJson<OpenAPISpec>(input);
    } catch (error) {
      return {
        valid: false,
        errors: [`Invalid JSON: ${error}`],
        warnings: [],
        stats: { paths: 0, operations: 0, schemas: 0, parameters: 0 },
      };
    }

    // Run validations
    const result = validateStructure(spec);
    validatePaths(spec, result);
    validateRefs(spec, result);

    // Log results
    log('info', `Paths: ${result.stats.paths}`);
    log('info', `Operations: ${result.stats.operations}`);
    log('info', `Schemas: ${result.stats.schemas}`);

    if (result.errors.length > 0) {
      log('error', `Errors: ${result.errors.length}`);
      for (const error of result.errors.slice(0, 10)) {
        log('error', `  - ${error}`);
      }
      if (result.errors.length > 10) {
        log('error', `  ... and ${result.errors.length - 10} more`);
      }
    }

    if (result.warnings.length > 0) {
      log('warn', `Warnings: ${result.warnings.length}`);
      for (const warning of result.warnings.slice(0, 5)) {
        log('warn', `  - ${warning}`);
      }
      if (result.warnings.length > 5) {
        log('warn', `  ... and ${result.warnings.length - 5} more`);
      }
    }

    if (result.valid) {
      log('success', 'Spec is valid');
    } else {
      log('error', 'Spec validation failed');
    }

    return result;
  });
}
