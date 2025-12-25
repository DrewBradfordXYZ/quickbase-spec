/**
 * Generate AI/human-friendly summaries of the QuickBase API
 *
 * Creates:
 * - output/OPERATIONS.md - Human/AI readable summary
 * - output/operations.json - Machine-readable lightweight summary
 */

import { readJson, writeJson, PATHS, log, runTask } from './common.js';
import { join } from 'path';
import { writeFileSync } from 'fs';

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, Schema>;
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
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
}

interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  schema?: Schema;
  description?: string;
}

interface RequestBody {
  required?: boolean;
  content?: {
    'application/json'?: {
      schema?: Schema;
    };
  };
}

interface Response {
  description: string;
  content?: {
    'application/json'?: {
      schema?: Schema;
    };
  };
}

interface Schema {
  type?: string;
  $ref?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  description?: string;
}

interface OperationSummary {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  pathParams: string[];
  queryParams: string[];
  hasRequestBody: boolean;
  requestBodyRequired: boolean;
  requestBodyFields: FieldInfo[];
  responseType: string;
  responseIsArray: boolean;
  successCode: string;
}

// Compact version for JSON output (no descriptions to save space)
interface CompactOperationSummary {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
  pathParams: string[];
  queryParams: string[];
  hasRequestBody: boolean;
  requestBodyRequired: boolean;
  requiredFields: string[];
  optionalFields: string[];
  responseType: string;
  responseIsArray: boolean;
}

interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

interface SummaryResult {
  operations: OperationSummary[];
  byTag: Record<string, OperationSummary[]>;
}

interface CompactSummaryResult {
  operations: CompactOperationSummary[];
  byTag: Record<string, CompactOperationSummary[]>;
}

/**
 * Convert full summary to compact format for JSON output
 */
function toCompact(op: OperationSummary): CompactOperationSummary {
  return {
    operationId: op.operationId,
    method: op.method,
    path: op.path,
    summary: op.summary,
    tags: op.tags,
    pathParams: op.pathParams,
    queryParams: op.queryParams,
    hasRequestBody: op.hasRequestBody,
    requestBodyRequired: op.requestBodyRequired,
    requiredFields: op.requestBodyFields.filter((f) => f.required).map((f) => f.name),
    optionalFields: op.requestBodyFields.filter((f) => !f.required).map((f) => f.name),
    responseType: op.responseType,
    responseIsArray: op.responseIsArray,
  };
}

/**
 * Resolve a $ref to get the schema name
 */
function getSchemaName(schema: Schema | undefined): string {
  if (!schema) return 'unknown';
  if (schema.$ref) {
    return schema.$ref.split('/').pop() || 'unknown';
  }
  if (schema.type === 'array' && schema.items) {
    return `[]${getSchemaName(schema.items)}`;
  }
  return schema.type || 'object';
}

/**
 * Extract field info from a schema
 */
function extractFields(schema: Schema | undefined, spec: OpenAPISpec, depth = 0): FieldInfo[] {
  if (!schema || depth > 2) return [];

  // Resolve $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    if (refName && spec.components?.schemas?.[refName]) {
      return extractFields(spec.components.schemas[refName], spec, depth + 1);
    }
    return [];
  }

  if (!schema.properties) return [];

  const required = new Set(schema.required || []);
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: getSchemaName(prop),
    required: required.has(name),
    description: prop.description,
  }));
}

/**
 * Extract operations from the spec
 */
function extractOperations(spec: OpenAPISpec): OperationSummary[] {
  const operations: OperationSummary[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of methods) {
      const op = pathItem[method];
      if (!op) continue;

      // Extract path and query params
      const pathParams: string[] = [];
      const queryParams: string[] = [];
      for (const param of op.parameters || []) {
        if (param.in === 'path') pathParams.push(param.name);
        if (param.in === 'query') queryParams.push(param.name);
      }

      // Extract request body info
      const requestSchema = op.requestBody?.content?.['application/json']?.schema;
      const requestBodyFields = extractFields(requestSchema, spec);

      // Find success response
      const successCodes = ['200', '201', '204', '207'];
      const successCode = successCodes.find((code) => op.responses?.[code]) || '200';
      const responseSchema = op.responses?.[successCode]?.content?.['application/json']?.schema;

      // Determine if response is an array
      const responseIsArray = responseSchema?.type === 'array';

      operations.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        summary: op.summary || '',
        description: op.description,
        tags: op.tags || [],
        pathParams,
        queryParams,
        hasRequestBody: !!requestSchema,
        requestBodyRequired: op.requestBody?.required || false,
        requestBodyFields,
        responseType: getSchemaName(responseSchema),
        responseIsArray,
        successCode,
      });
    }
  }

  return operations.sort((a, b) => a.operationId.localeCompare(b.operationId));
}

/**
 * Group operations by tag
 */
function groupByTag(operations: OperationSummary[]): Record<string, OperationSummary[]> {
  const byTag: Record<string, OperationSummary[]> = {};

  for (const op of operations) {
    const tag = op.tags[0] || 'Other';
    if (!byTag[tag]) byTag[tag] = [];
    byTag[tag].push(op);
  }

  // Sort tags and operations within each tag
  const sortedByTag: Record<string, OperationSummary[]> = {};
  for (const tag of Object.keys(byTag).sort()) {
    sortedByTag[tag] = byTag[tag].sort((a, b) => a.operationId.localeCompare(b.operationId));
  }

  return sortedByTag;
}

/**
 * Generate markdown summary
 */
function generateMarkdown(summary: SummaryResult, spec: OpenAPISpec): string {
  const lines: string[] = [];

  lines.push(`# QuickBase API Operations`);
  lines.push('');
  lines.push(`Auto-generated summary of ${summary.operations.length} API operations.`);
  lines.push('');
  lines.push(`**Spec Version:** ${spec.info.version}`);
  lines.push('');

  // Table of contents by tag
  lines.push('## Operations by Category');
  lines.push('');

  for (const [tag, ops] of Object.entries(summary.byTag)) {
    lines.push(`### ${tag} (${ops.length})`);
    lines.push('');
    lines.push('| Operation | Method | Path | Summary |');
    lines.push('|-----------|--------|------|---------|');
    for (const op of ops) {
      lines.push(`| \`${op.operationId}\` | ${op.method} | \`${op.path}\` | ${op.summary} |`);
    }
    lines.push('');
  }

  // Detailed operation reference
  lines.push('---');
  lines.push('');
  lines.push('## Operation Details');
  lines.push('');

  for (const op of summary.operations) {
    lines.push(`### ${op.operationId}`);
    lines.push('');
    lines.push(`**${op.method}** \`${op.path}\``);
    lines.push('');
    if (op.summary) {
      lines.push(op.summary);
      lines.push('');
    }

    // Path parameters
    if (op.pathParams.length > 0) {
      lines.push(`**Path Parameters:** ${op.pathParams.map((p) => `\`${p}\``).join(', ')}`);
      lines.push('');
    }

    // Query parameters
    if (op.queryParams.length > 0) {
      lines.push(`**Query Parameters:** ${op.queryParams.map((p) => `\`${p}\``).join(', ')}`);
      lines.push('');
    }

    // Request body
    if (op.hasRequestBody && op.requestBodyFields.length > 0) {
      lines.push(`**Request Body:** ${op.requestBodyRequired ? '(required)' : '(optional)'}`);
      lines.push('');
      const requiredFields = op.requestBodyFields.filter((f) => f.required);
      const optionalFields = op.requestBodyFields.filter((f) => !f.required);

      if (requiredFields.length > 0) {
        lines.push('Required fields:');
        for (const f of requiredFields) {
          lines.push(`- \`${f.name}\` (${f.type})`);
        }
        lines.push('');
      }

      if (optionalFields.length > 0 && optionalFields.length <= 10) {
        lines.push('Optional fields:');
        for (const f of optionalFields) {
          lines.push(`- \`${f.name}\` (${f.type})`);
        }
        lines.push('');
      } else if (optionalFields.length > 10) {
        lines.push(`Optional fields: ${optionalFields.length} additional fields`);
        lines.push('');
      }
    }

    // Response
    lines.push(`**Response:** ${op.successCode} → \`${op.responseType}\``);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Main function
 */
async function summarize(): Promise<void> {
  await runTask('Generate API summary', async () => {
    const specPath = join(PATHS.output, 'quickbase-patched.json');
    const spec = readJson<OpenAPISpec>(specPath);

    const operations = extractOperations(spec);
    const byTag = groupByTag(operations);
    const summary: SummaryResult = { operations, byTag };

    // Write compact JSON summary (no descriptions, smaller file)
    const compactSummary: CompactSummaryResult = {
      operations: operations.map(toCompact),
      byTag: Object.fromEntries(
        Object.entries(byTag).map(([tag, ops]) => [tag, ops.map(toCompact)])
      ),
    };
    const jsonPath = join(PATHS.output, 'operations.json');
    writeJson(jsonPath, compactSummary);
    log('success', `Wrote ${jsonPath}`);

    // Write Markdown summary
    const mdPath = join(PATHS.output, 'OPERATIONS.md');
    const markdown = generateMarkdown(summary, spec);
    writeFileSync(mdPath, markdown);
    log('success', `Wrote ${mdPath}`);

    log('info', `Summarized ${operations.length} operations in ${Object.keys(byTag).length} categories`);
  });
}

// Run if called directly
summarize().catch((err) => {
  log('error', err.message);
  process.exit(1);
});
