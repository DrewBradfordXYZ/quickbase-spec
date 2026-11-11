/**
 * Normalize QuickBase's portal spec into the shape the patch step and the
 * SDK generators expect.
 *
 * The source is source/quickbase-portal-openapi3.json, which fetch-upstream
 * extracts from developer.quickbase.com. Normalizing:
 * - inlines every local $ref (parameters, responses, schemas), so generated
 *   type names come from the operation, as they always have, rather than
 *   from the portal's component names;
 * - keeps operation names stable where QuickBase renamed one, since a
 *   rename changes SDK method names;
 * - merges allOf parts into one schema (the portal wraps bodies and
 *   properties in single-part allOf, which builders read as having no
 *   properties);
 * - gives a schema with properties but no type its object type;
 * - resolves a oneOf marked x-preferred-type to that type (field IDs the
 *   API also accepts as digit strings stay integers in the SDKs);
 * - gives a JSON response that has only an example an untyped schema;
 * - drops the schema of content that isn't JSON (QBL YAML, file content,
 *   documents): the SDKs send and return those as raw bytes, and a schema
 *   there makes generators decode them (as YAML, into a string, which fails);
 * - marks every object as accepting unlisted keys. The portal marks almost
 *   none, and generated types only keep keys they don't list
 *   (AdditionalProperties) when the schema says so; the API often returns
 *   more than the spec lists (see audit-live).
 *
 * Writes output/quickbase-openapi3.json, which the patch step reads.
 */

import { readJson, writeJson, PATHS, log, runTask } from './common.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { PORTAL_SPEC } from './fetch-upstream.js';

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  additionalProperties?: boolean | Schema;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  [key: string]: unknown;
}
type Operation = Record<string, unknown> & {
  operationId?: string;
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { content?: Record<string, { schema?: Schema }> }>;
};
interface PortalSpec {
  openapi: string;
  info: Record<string, unknown>;
  paths: Record<string, Record<string, Operation>>;
  components?: Record<string, Record<string, unknown>>;
}

/**
 * Operations QuickBase renamed, upstream name -> the name the SDKs use.
 * The path and method are unchanged.
 */
const KEEP_OPERATION_NAMES: Record<string, string> = {
  updateSolutionFromRecord: 'updateSolutionToRecord',
};

const METHODS = ['get', 'post', 'put', 'delete', 'patch'];

function inlineRefs<T>(value: T, components: PortalSpec['components'], depth = 0): T {
  if (depth > 40) throw new Error('normalize: $ref nesting too deep (recursive schema?)');
  if (Array.isArray(value)) return value.map((v) => inlineRefs(v, components, depth)) as T;
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  if (typeof obj.$ref === 'string') {
    const [, , kind, name] = obj.$ref.split('/');
    const target = components?.[kind]?.[name];
    if (!target) throw new Error(`normalize: unresolved ${obj.$ref}`);
    return inlineRefs(structuredClone(target), components, depth + 1) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = inlineRefs(v, components, depth);
  return out as T;
}

/** Fold allOf parts into the schema itself; the outer schema's own keys win. */
function mergeAllOf(schema: Schema): void {
  if (!schema.allOf) return;
  const parts = schema.allOf;
  delete schema.allOf;
  for (const part of parts) {
    mergeAllOf(part);
    for (const [k, v] of Object.entries(part)) {
      if (k === 'properties') {
        schema.properties = { ...(v as Record<string, Schema>), ...(schema.properties ?? {}) };
      } else if (k === 'required') {
        schema.required = [...new Set([...((schema.required as string[]) ?? []), ...(v as string[])])];
      } else if (schema[k] === undefined) {
        schema[k] = v;
      }
    }
  }
}

/** Give typeless objects their type and open every object to unlisted keys. */
function normalizeSchema(schema: Schema | undefined): void {
  if (!schema || typeof schema !== 'object') return;
  mergeAllOf(schema);
  const preferred = schema['x-preferred-type'];
  if (typeof preferred === 'string' && schema.oneOf) {
    delete schema.oneOf;
    delete schema['x-preferred-type'];
    schema.type = preferred;
  }
  if (schema.properties && !schema.type) schema.type = 'object';
  if (schema.type === 'object' && schema.additionalProperties === undefined) {
    schema.additionalProperties = true;
  }
  for (const p of Object.values(schema.properties ?? {})) normalizeSchema(p);
  normalizeSchema(schema.items);
  if (typeof schema.additionalProperties === 'object') normalizeSchema(schema.additionalProperties);
  for (const s of [...(schema.allOf ?? []), ...(schema.oneOf ?? []), ...(schema.anyOf ?? [])]) normalizeSchema(s);
}

export function normalizeSpec(portal: PortalSpec): Record<string, unknown> {
  const paths = inlineRefs(portal.paths, portal.components);
  for (const item of Object.values(paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const kept = op.operationId && KEEP_OPERATION_NAMES[op.operationId];
      if (kept) op.operationId = kept;
      for (const [type, c] of Object.entries(op.requestBody?.content ?? {})) {
        if (!type.includes('json')) delete c.schema;
        else normalizeSchema(c.schema);
      }
      for (const r of Object.values(op.responses ?? {})) {
        for (const [type, c] of Object.entries(r?.content ?? {})) {
          // An example with no schema (several solution responses)
          if (type.includes('json') && !c.schema) {
            const example = (c as Record<string, unknown>).example;
            c.schema = example === undefined ? {} : { example };
            delete (c as Record<string, unknown>).example;
          }
          if (!type.includes('json')) delete c.schema;
          else normalizeSchema(c.schema);
        }
      }
    }
  }

  return {
    openapi: '3.0.3',
    info: { ...portal.info, description: 'QuickBase JSON RESTful API' },
    servers: [{ url: 'https://api.quickbase.com/v1/', description: 'QuickBase API' }],
    paths,
    components: {
      schemas: {},
      securitySchemes: {
        userToken: { type: 'apiKey', name: 'Authorization', in: 'header', description: 'User token: QB-USER-TOKEN {token}' },
        tempToken: { type: 'apiKey', name: 'Authorization', in: 'header', description: 'Temporary token: QB-TEMP-TOKEN {token}' },
      },
    },
    security: [{ userToken: [] }],
  };
}

export async function normalize(inputPath?: string): Promise<void> {
  await runTask('Normalize the portal spec', async () => {
    const input = inputPath ?? PORTAL_SPEC;
    if (!existsSync(input)) {
      throw new Error(`${input} not found; run fetch-upstream --write`);
    }
    const spec = normalizeSpec(readJson<PortalSpec>(input));
    const outputPath = join(PATHS.output, 'quickbase-openapi3.json');
    writeJson(outputPath, spec);
    log('info', `Wrote ${outputPath} (${Object.keys(spec.paths as object).length} paths)`);
  });
}
