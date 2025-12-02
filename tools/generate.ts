/**
 * Generate fixtures from OpenAPI spec examples
 *
 * Extracts examples from the spec and generates test fixtures
 * in the standard { _meta, body } format.
 */

import { readJson, writeJson, PATHS, log, runTask } from './common.js';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync } from 'fs';

interface OpenAPISpec {
  openapi: string;
  paths: Record<string, PathItem>;
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
  tags?: string[];
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: {
          example?: unknown;
        };
      };
    };
  };
  responses?: Record<string, Response>;
}

interface Response {
  description: string;
  content?: {
    'application/json'?: {
      schema?: {
        example?: unknown;
        'x-amf-examples'?: Record<string, unknown>;
      };
    };
  };
}

interface Fixture {
  _meta: {
    description: string;
    status: number;
    headers: Record<string, string>;
  };
  body: unknown;
}

interface RequestFixture {
  _meta: {
    description: string;
  };
  body: unknown;
}

interface GenerateResult {
  generated: number;
  skipped: number;
  operations: string[];
}

/**
 * Convert operationId to kebab-case folder name
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Extract the actual example value (handles value wrapper)
 */
function extractExampleValue(example: unknown): unknown {
  if (example && typeof example === 'object' && 'value' in example) {
    return (example as { value: unknown }).value;
  }
  return example;
}

/**
 * Get existing fixture files for an operation
 */
function getExistingFixtures(fixtureDir: string): Set<string> {
  const existing = new Set<string>();
  if (existsSync(fixtureDir)) {
    const files = readdirSync(fixtureDir);
    for (const file of files) {
      existing.add(file);
    }
  }
  return existing;
}

/**
 * Generate fixtures for a single operation
 */
function generateOperationFixtures(
  operation: Operation,
  tag: string,
  existingFixtures: Set<string>
): { fixtures: Array<{ path: string; content: Fixture | RequestFixture }>; skipped: number } {
  const fixtures: Array<{ path: string; content: Fixture | RequestFixture }> = [];
  let skipped = 0;
  const operationDir = toKebabCase(operation.operationId);
  const baseDir = join(PATHS.fixtures, tag.toLowerCase(), operationDir);

  // Generate request fixture from requestBody example
  if (operation.requestBody?.content?.['application/json']?.schema?.example) {
    const example = operation.requestBody.content['application/json'].schema.example;
    const body = extractExampleValue(example);
    const fileName = 'request.json';

    if (!existingFixtures.has(fileName)) {
      const fixture: RequestFixture = {
        _meta: {
          description: `Request body for ${operation.operationId}`,
        },
        body,
      };
      fixtures.push({ path: join(baseDir, fileName), content: fixture });
    } else {
      skipped++;
    }
  }

  // Generate response fixtures from x-amf-examples
  if (operation.responses) {
    for (const [statusCode, response] of Object.entries(operation.responses)) {
      // Skip non-numeric status codes like "default"
      const status = parseInt(statusCode, 10);
      if (isNaN(status)) continue;

      const schema = response.content?.['application/json']?.schema;
      if (!schema) continue;

      // Check for x-amf-examples (named examples)
      if (schema['x-amf-examples']) {
        const examples = schema['x-amf-examples'];
        const exampleEntries = Object.entries(examples);

        if (exampleEntries.length === 1) {
          // Single example: use response.{status}.json
          const [name, example] = exampleEntries[0];
          const body = extractExampleValue(example);
          const fileName = `response.${status}.json`;

          if (!existingFixtures.has(fileName)) {
            const fixture: Fixture = {
              _meta: {
                description: name,
                status,
                headers: {
                  'Content-Type': 'application/json',
                },
              },
              body,
            };
            fixtures.push({ path: join(baseDir, fileName), content: fixture });
          } else {
            skipped++;
          }
        } else {
          // Multiple examples: use response.{status}.{name}.json
          for (const [name, example] of exampleEntries) {
            const body = extractExampleValue(example);
            const safeName = name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '');
            const fileName = `response.${status}.${safeName}.json`;

            if (!existingFixtures.has(fileName)) {
              const fixture: Fixture = {
                _meta: {
                  description: name,
                  status,
                  headers: {
                    'Content-Type': 'application/json',
                  },
                },
                body,
              };
              fixtures.push({ path: join(baseDir, fileName), content: fixture });
            } else {
              skipped++;
            }
          }
        }
      } else if (schema.example) {
        // Single example property
        const body = extractExampleValue(schema.example);
        const fileName = `response.${status}.json`;

        if (!existingFixtures.has(fileName)) {
          const fixture: Fixture = {
            _meta: {
              description: response.description || `${status} response for ${operation.operationId}`,
              status,
              headers: {
                'Content-Type': 'application/json',
              },
            },
            body,
          };
          fixtures.push({ path: join(baseDir, fileName), content: fixture });
        } else {
          skipped++;
        }
      }
    }
  }

  return { fixtures, skipped };
}

/**
 * Main generate function
 */
export async function generate(inputPath?: string): Promise<GenerateResult> {
  return await runTask('Generate fixtures from spec', async () => {
    // Find input file
    const input = inputPath || join(PATHS.output, 'quickbase-patched.json');

    if (!existsSync(input)) {
      throw new Error(`Input file not found: ${input}`);
    }

    // Read spec
    const spec = readJson<OpenAPISpec>(input);

    const result: GenerateResult = {
      generated: 0,
      skipped: 0,
      operations: [],
    };

    // Process each operation
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
        const operation = pathItem[method];
        if (!operation) continue;

        const tag = operation.tags?.[0] || 'misc';
        const operationDir = toKebabCase(operation.operationId);
        const fixtureDir = join(PATHS.fixtures, tag.toLowerCase(), operationDir);

        // Get existing fixtures to avoid overwriting
        const existingFixtures = getExistingFixtures(fixtureDir);

        // Generate fixtures for this operation
        const { fixtures, skipped } = generateOperationFixtures(operation, tag, existingFixtures);

        result.skipped += skipped;

        if (fixtures.length > 0) {
          result.operations.push(operation.operationId);

          for (const { path: fixturePath, content } of fixtures) {
            // Ensure directory exists
            const dir = join(fixturePath, '..');
            if (!existsSync(dir)) {
              mkdirSync(dir, { recursive: true });
            }

            writeJson(fixturePath, content);
            result.generated++;
            log('success', `Generated: ${fixturePath.replace(PATHS.fixtures + '/', '')}`);
          }
        }
      }
    }

    // Summary
    log('info', `\nGenerated ${result.generated} fixtures for ${result.operations.length} operations`);
    if (result.skipped > 0) {
      log('info', `Skipped ${result.skipped} existing fixtures`);
    }

    return result;
  });
}
