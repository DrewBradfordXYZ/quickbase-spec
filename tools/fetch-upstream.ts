/**
 * Fetch upstream - get QuickBase's current spec from its API portal
 *
 * developer.quickbase.com publishes no spec file. Its page loads a manifest
 * naming the current docs bundle, and that bundle embeds the spec as
 * JSON.parse('{"openapi":"3.0.1",...}'). This follows the manifest, extracts
 * the string as data (nothing from the bundle is executed), and compares it
 * with the spec we build from, by operation, parameters and request/response
 * property names, so it is clear whether the SDKs need regenerating.
 *
 * It depends on how the portal is built. If the manifest, the bundle or the
 * embedded spec can't be found it fails, rather than save something wrong.
 *
 *   fetch-upstream          compare only; exit 2 when upstream changed
 *   fetch-upstream --write  also save it to source/ with where and when it came from
 */

import { readJson, writeJson, PATHS, log } from './common.js';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { brotliDecompressSync, gunzipSync } from 'zlib';

const CDN = 'https://ui-features.quickbase.com';
const MANIFEST = `${CDN}/manifests/prod.manifest.js`;
const MARKER = `JSON.parse('{"openapi"`;

export const PORTAL_SPEC = join(PATHS.source, 'quickbase-portal-openapi3.json');
export const PORTAL_META = join(PATHS.source, 'quickbase-portal-meta.json');

interface Spec {
  openapi?: string;
  swagger?: string;
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, Schema>; parameters?: Record<string, Parameter> };
  definitions?: Record<string, Schema>;
}
interface Operation {
  operationId?: string;
  parameters?: (Parameter & { $ref?: string })[];
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { content?: Record<string, { schema?: Schema }>; schema?: Schema }>;
}
interface Parameter {
  name?: string;
  in?: string;
  schema?: Schema;
}
interface Schema {
  $ref?: string;
  type?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  allOf?: Schema[];
}

interface Meta {
  bundle: string;
  fetchedAt: string;
  sha256: string;
}

async function getText(url: string): Promise<string> {
  const resp = await fetch(url, { headers: { 'User-Agent': 'quickbase-spec-fetch-upstream' } });
  if (!resp.ok) throw new Error(`${url}: HTTP ${resp.status}`);
  const bytes = Buffer.from(await resp.arrayBuffer());
  const text = bytes.toString('utf8');
  if (text.includes('openapi') || text.includes('ui-api-docs')) return text;
  // The CDN stores the bundle pre-compressed; decode it if fetch didn't
  for (const decode of [brotliDecompressSync, gunzipSync]) {
    try {
      return decode(bytes).toString('utf8');
    } catch {
      // try the next
    }
  }
  return text;
}

/** Read a single-quoted JavaScript string literal starting at `start` (just after the quote). */
function readJsString(source: string, start: number): string {
  const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };
  let out = '';
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === "'") return out;
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = source[++i];
    if (n === 'u') {
      out += String.fromCharCode(parseInt(source.slice(i + 1, i + 5), 16));
      i += 4;
    } else if (n === 'x') {
      out += String.fromCharCode(parseInt(source.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out += simple[n] ?? n;
    }
  }
  throw new Error('unterminated string literal in the docs bundle');
}

export async function fetchPortalSpec(): Promise<{ spec: Spec; meta: Meta }> {
  const manifest = await getText(MANIFEST);
  const bundlePath = manifest.match(/"ui-api-docs"\s*:\s*"([^"]+)"/)?.[1];
  if (!bundlePath) throw new Error(`no ui-api-docs entry in ${MANIFEST}; the portal changed how it loads`);
  const bundleUrl = `${CDN}${bundlePath}.js`;

  const bundle = await getText(bundleUrl);
  const at = bundle.indexOf(MARKER);
  if (at < 0) throw new Error(`no embedded spec (${MARKER}) in ${bundleUrl}; the portal changed how it ships it`);
  const json = readJsString(bundle, at + "JSON.parse('".length);

  const spec = JSON.parse(json) as Spec;
  if (!spec.openapi?.startsWith('3.') || Object.keys(spec.paths ?? {}).length < 20) {
    throw new Error(`embedded spec doesn't look like the API spec (openapi ${spec.openapi}, ${Object.keys(spec.paths ?? {}).length} paths)`);
  }
  return {
    spec,
    meta: {
      bundle: bundlePath,
      fetchedAt: new Date().toISOString(),
      sha256: createHash('sha256').update(json).digest('hex'),
    },
  };
}

/** Operation signatures: parameters and request/response property paths, for comparing specs of either format. */
function signatures(spec: Spec): Map<string, { key: string; sig: Set<string> }> {
  const schemas = spec.components?.schemas ?? spec.definitions ?? {};
  const params = spec.components?.parameters ?? {};
  const deref = (s: Schema | undefined): Schema | undefined => {
    for (let i = 0; s?.$ref && i < 10; i++) {
      const name = s.$ref.split('/').pop()!;
      s = schemas[name];
    }
    return s;
  };
  const props = (s: Schema | undefined, prefix: string, out: Set<string>, depth: number): void => {
    s = deref(s);
    if (!s || depth > 4) return;
    for (const part of s.allOf ?? []) props(part, prefix, out, depth);
    if (s.type === 'array' || s.items) props(s.items, `${prefix}[]`, out, depth + 1);
    for (const [name, child] of Object.entries(s.properties ?? {})) {
      out.add(`${prefix}.${name}`);
      props(child, `${prefix}.${name}`, out, depth + 1);
    }
  };

  const out = new Map<string, { key: string; sig: Set<string> }>();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (!op?.operationId) continue;
      const sig = new Set<string>();
      for (const p of op.parameters ?? []) {
        const param = p.$ref ? params[p.$ref.split('/').pop()!] : p;
        // Swagger 2 body parameters become the request body below
        if (param?.in === 'body') props((param as { schema?: Schema }).schema, 'body', sig, 0);
        else if (param?.name && !['QB-Realm-Hostname', 'Authorization', 'User-Agent'].includes(param.name)) {
          sig.add(`param ${param.in}:${param.name}`);
        }
      }
      props(op.requestBody?.content?.['application/json']?.schema, 'body', sig, 0);
      const ok = op.responses?.['200'];
      props(ok?.content?.['application/json']?.schema ?? ok?.schema, 'response', sig, 0);
      out.set(op.operationId, { key: `${method.toUpperCase()} ${path}`, sig });
    }
  }
  return out;
}

/** Lines describing how `next` differs from `current`; empty when they match. */
export function compareSpecs(current: Spec, next: Spec): string[] {
  const a = signatures(current);
  const b = signatures(next);
  const lines: string[] = [];
  const byKey = new Map([...a].map(([id, v]) => [v.key, id]));

  for (const [id, v] of b) {
    if (a.has(id)) continue;
    const old = byKey.get(v.key);
    if (old && !b.has(old)) lines.push(`renamed   ${old} -> ${id}  (${v.key})`);
    else lines.push(`added     ${id}  (${v.key})`);
  }
  const renamedFrom = new Set(lines.filter((l) => l.startsWith('renamed')).map((l) => l.split(/\s+/)[1]));
  for (const [id, v] of a) {
    if (!b.has(id) && !renamedFrom.has(id)) lines.push(`removed   ${id}  (${v.key})`);
  }
  for (const [id, v] of b) {
    const old = a.get(id);
    if (!old) continue;
    const added = [...v.sig].filter((s) => !old.sig.has(s));
    const removed = [...old.sig].filter((s) => !v.sig.has(s));
    if (old.key !== v.key) lines.push(`moved     ${id}  ${old.key} -> ${v.key}`);
    if (added.length || removed.length) {
      lines.push(`changed   ${id}`);
      for (const s of added.sort()) lines.push(`            + ${s}`);
      for (const s of removed.sort()) lines.push(`            - ${s}`);
    }
  }
  return lines;
}

export async function fetchUpstream(args: string[]): Promise<number> {
  const write = args.includes('--write');
  const { spec, meta } = await fetchPortalSpec();
  log('info', `Portal bundle ${meta.bundle}: OpenAPI ${spec.openapi}, ${Object.keys(spec.paths).length} paths`);

  // Compare with the last portal fetch, or with the spec we currently build from
  let baseline: Spec;
  let against: string;
  if (existsSync(PORTAL_SPEC)) {
    baseline = readJson<Spec>(PORTAL_SPEC);
    const prev = existsSync(PORTAL_META) ? readJson<Meta>(PORTAL_META) : undefined;
    if (prev?.sha256 === meta.sha256) {
      log('success', `Unchanged since ${prev.fetchedAt} (${prev.bundle})`);
      return 0;
    }
    against = `the last fetch${prev ? ` (${prev.bundle}, ${prev.fetchedAt})` : ''}`;
  } else {
    baseline = readJson<Spec>(join(PATHS.source, 'quickbase-swagger.json'));
    against = 'source/quickbase-swagger.json';
  }

  const lines = compareSpecs(baseline, spec);
  if (lines.length === 0) {
    log('success', `No API changes against ${against}`);
  } else {
    console.log(`\nChanges against ${against}:\n${lines.join('\n')}\n`);
  }

  if (write) {
    writeJson(PORTAL_SPEC, spec);
    writeJson(PORTAL_META, meta);
    log('info', `Wrote ${PORTAL_SPEC} and ${PORTAL_META}`);
  }
  return lines.length === 0 ? 0 : 2;
}
