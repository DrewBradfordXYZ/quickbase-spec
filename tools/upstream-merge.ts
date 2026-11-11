/**
 * Merge what QuickBase's current spec adds into the spec we build from.
 *
 * We build from a Swagger 2.0 source whose objects accept unlisted keys;
 * the portal's OpenAPI 3 spec (fetch-upstream --write) marks almost none
 * that way and names its schemas differently, so building from it directly
 * would drop the SDKs' AdditionalProperties and rename types. Instead this
 * takes what upstream adds, add-only:
 * - operations ours lacks, matched by method and path (so an operation
 *   upstream renamed keeps our name),
 * - parameters ours lacks,
 * - request and 200 response properties ours lacks, at any depth.
 * It never replaces or retypes anything ours defines, and every object it
 * adds accepts unlisted keys, like the rest of our spec.
 */

import { readJson, log } from './common.js';
import { existsSync } from 'fs';
import { PORTAL_SPEC } from './fetch-upstream.js';

interface Schema {
  $ref?: string;
  type?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  [key: string]: unknown;
}
interface Parameter {
  name?: string;
  in?: string;
  $ref?: string;
  [key: string]: unknown;
}
interface Operation {
  operationId?: string;
  parameters?: Parameter[];
  requestBody?: { content?: Record<string, { schema?: Schema }>; [key: string]: unknown };
  responses?: Record<string, { content?: Record<string, { schema?: Schema }>; [key: string]: unknown }>;
  [key: string]: unknown;
}
interface Spec {
  paths: Record<string, Record<string, Operation>>;
  components?: Record<string, Record<string, unknown>>;
}

const METHODS = ['get', 'post', 'put', 'delete', 'patch'];

/** Replace every local $ref with a copy of what it names. */
function inlineRefs<T>(value: T, components: Spec['components'], depth = 0): T {
  if (depth > 40) throw new Error('upstream spec: $ref nesting too deep (recursive schema?)');
  if (Array.isArray(value)) return value.map((v) => inlineRefs(v, components, depth)) as T;
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  if (typeof obj.$ref === 'string') {
    const [, , kind, name] = obj.$ref.split('/');
    const target = components?.[kind]?.[name];
    if (!target) throw new Error(`upstream spec: unresolved ${obj.$ref}`);
    return inlineRefs(structuredClone(target), components, depth + 1) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = inlineRefs(v, components, depth);
  return out as T;
}

/** Objects we add accept unlisted keys, as the rest of our spec does. */
function openObjects(schema: Schema | undefined): void {
  if (!schema) return;
  if ((schema.type === 'object' || schema.properties) && schema.additionalProperties === undefined) {
    schema.additionalProperties = true;
  }
  for (const p of Object.values(schema.properties ?? {})) openObjects(p);
  openObjects(schema.items);
  for (const s of [...(schema.allOf ?? []), ...(schema.oneOf ?? []), ...(schema.anyOf ?? [])]) openObjects(s);
}

/** Add theirs' properties ours lacks, recursively; returns the paths added. */
function mergeSchema(ours: Schema | undefined, theirs: Schema | undefined, path: string, added: string[]): void {
  if (!ours || !theirs || ours.$ref) return;
  if (theirs.properties) {
    ours.properties ??= ours.type === 'object' || !ours.type ? {} : undefined;
    if (!ours.properties) return;
    for (const [name, schema] of Object.entries(theirs.properties)) {
      if (ours.properties[name]) {
        mergeSchema(ours.properties[name], schema, `${path}.${name}`, added);
      } else {
        const copy = structuredClone(schema);
        openObjects(copy);
        ours.properties[name] = copy;
        added.push(`${path}.${name}`);
      }
    }
  }
  if (ours.items && theirs.items) mergeSchema(ours.items, theirs.items, `${path}[]`, added);
}

function jsonSchema(part: { content?: Record<string, { schema?: Schema }> } | undefined): Schema | undefined {
  return part?.content?.['application/json']?.schema;
}

export function mergeUpstream(spec: Spec): void {
  if (!existsSync(PORTAL_SPEC)) return;
  const upstream = readJson<Spec>(PORTAL_SPEC);
  const paths = inlineRefs(upstream.paths, upstream.components);

  for (const [path, item] of Object.entries(paths)) {
    for (const method of METHODS) {
      const theirs = item[method];
      if (!theirs) continue;
      const ours = spec.paths[path]?.[method];

      if (!ours) {
        const op = structuredClone(theirs);
        openObjects(jsonSchema(op.requestBody));
        for (const r of Object.values(op.responses ?? {})) openObjects(jsonSchema(r));
        spec.paths[path] ??= {};
        spec.paths[path][method] = op;
        log('info', `Upstream: added ${theirs.operationId} (${method.toUpperCase()} ${path})`);
        continue;
      }

      const added: string[] = [];
      const have = new Set((ours.parameters ?? []).map((p) => `${p.in}:${p.name}`));
      for (const p of theirs.parameters ?? []) {
        if (have.has(`${p.in}:${p.name}`)) continue;
        (ours.parameters ??= []).push(structuredClone(p));
        added.push(`param ${p.in}:${p.name}`);
      }
      const theirBody = jsonSchema(theirs.requestBody);
      if (theirBody) {
        if (!jsonSchema(ours.requestBody)) {
          const body = structuredClone(theirs.requestBody!);
          openObjects(jsonSchema(body));
          ours.requestBody = body;
          added.push('requestBody');
        } else {
          mergeSchema(jsonSchema(ours.requestBody), theirBody, 'body', added);
        }
      }
      const theirOk = jsonSchema(theirs.responses?.['200']);
      if (theirOk) {
        const ourOk = jsonSchema(ours.responses?.['200']);
        if (ourOk) mergeSchema(ourOk.type === 'array' ? ourOk.items : ourOk, theirOk.type === 'array' ? theirOk.items : theirOk, 'response', added);
      }
      if (added.length > 0) {
        log('info', `Upstream: ${ours.operationId} gained ${added.join(', ')}`);
      }
    }
  }
}
