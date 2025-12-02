/**
 * Split OpenAPI spec by tag
 *
 * Useful for:
 * - Working with AI tools that have context limits
 * - Focused editing of specific API domains
 * - Parallel processing
 */

import { readJson, writeJson, PATHS, log, runTask } from './common.js';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

interface OpenAPISpec {
  openapi: string;
  info: Record<string, unknown>;
  servers?: unknown[];
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  tags?: Array<{ name: string; description?: string }>;
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
  tags?: string[];
  responses?: Record<string, unknown>;
  parameters?: unknown[];
  requestBody?: unknown;
}

/**
 * Collect all $refs from an object
 */
function collectRefs(obj: unknown, refs: Set<string>): void {
  if (typeof obj !== 'object' || obj === null) return;

  if ('$ref' in obj && typeof (obj as Record<string, unknown>).$ref === 'string') {
    refs.add((obj as Record<string, unknown>).$ref as string);
  }

  for (const value of Object.values(obj as Record<string, unknown>)) {
    collectRefs(value, refs);
  }
}

/**
 * Extract schema names from $refs
 */
function extractSchemaNames(refs: Set<string>): Set<string> {
  const schemas = new Set<string>();

  for (const ref of refs) {
    if (ref.startsWith('#/components/schemas/')) {
      schemas.add(ref.replace('#/components/schemas/', ''));
    }
  }

  return schemas;
}

/**
 * Split spec by tag
 */
export async function split(inputPath?: string): Promise<void> {
  await runTask('Split OpenAPI spec by tag', async () => {
    // Find input file
    const input = inputPath || join(PATHS.output, 'quickbase-patched.json');

    if (!existsSync(input)) {
      throw new Error(`Input file not found: ${input}`);
    }

    // Read spec
    const spec = readJson<OpenAPISpec>(input);

    // Group paths by tag
    const pathsByTag = new Map<string, Record<string, PathItem>>();
    const untaggedPaths: Record<string, PathItem> = {};

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      // Find tags from operations
      const tags = new Set<string>();
      for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
        const operation = pathItem[method];
        if (operation?.tags) {
          for (const tag of operation.tags) {
            tags.add(tag.toLowerCase());
          }
        }
      }

      if (tags.size === 0) {
        untaggedPaths[path] = pathItem;
      } else {
        for (const tag of tags) {
          if (!pathsByTag.has(tag)) {
            pathsByTag.set(tag, {});
          }
          pathsByTag.get(tag)![path] = pathItem;
        }
      }
    }

    // Create output directory
    const outputDir = join(PATHS.output, 'split');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Write split files
    const allSchemas = spec.components?.schemas || {};

    for (const [tag, paths] of pathsByTag) {
      // Collect $refs used by this tag's paths
      const refs = new Set<string>();
      collectRefs(paths, refs);
      const schemaNames = extractSchemaNames(refs);

      // Build minimal schema set for this tag
      const tagSchemas: Record<string, unknown> = {};
      for (const name of schemaNames) {
        if (allSchemas[name]) {
          tagSchemas[name] = allSchemas[name];
          // Also collect nested $refs
          const nestedRefs = new Set<string>();
          collectRefs(allSchemas[name], nestedRefs);
          for (const nestedName of extractSchemaNames(nestedRefs)) {
            if (allSchemas[nestedName]) {
              tagSchemas[nestedName] = allSchemas[nestedName];
            }
          }
        }
      }

      const tagSpec: OpenAPISpec = {
        openapi: spec.openapi,
        info: {
          ...spec.info,
          title: `${spec.info.title} - ${tag}`,
        },
        servers: spec.servers,
        paths,
        components: {
          schemas: tagSchemas,
          securitySchemes: spec.components?.securitySchemes,
        },
      };

      const outputPath = join(outputDir, `${tag}.json`);
      writeJson(outputPath, tagSpec);

      log('info', `${tag}: ${Object.keys(paths).length} paths, ${Object.keys(tagSchemas).length} schemas`);
    }

    // Write untagged paths if any
    if (Object.keys(untaggedPaths).length > 0) {
      const refs = new Set<string>();
      collectRefs(untaggedPaths, refs);
      const schemaNames = extractSchemaNames(refs);

      const untaggedSchemas: Record<string, unknown> = {};
      for (const name of schemaNames) {
        if (allSchemas[name]) {
          untaggedSchemas[name] = allSchemas[name];
        }
      }

      const untaggedSpec: OpenAPISpec = {
        openapi: spec.openapi,
        info: {
          ...spec.info,
          title: `${spec.info.title} - Other`,
        },
        servers: spec.servers,
        paths: untaggedPaths,
        components: {
          schemas: untaggedSchemas,
          securitySchemes: spec.components?.securitySchemes,
        },
      };

      const outputPath = join(outputDir, 'other.json');
      writeJson(outputPath, untaggedSpec);

      log('info', `other: ${Object.keys(untaggedPaths).length} paths`);
    }

    log('success', `Split into ${pathsByTag.size + (Object.keys(untaggedPaths).length > 0 ? 1 : 0)} files`);
  });
}
