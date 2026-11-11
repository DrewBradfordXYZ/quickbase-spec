/**
 * Live audit - compare real API responses with the patched spec
 *
 * Fixtures are generated from the spec's own examples, so the health check
 * cannot find what the spec leaves out. This calls read-only endpoints on a
 * realm you choose and reports, per operation:
 * - undocumented: properties the API returns that the spec does not define
 * - type mismatches: a defined property returned with another JSON type
 * - never seen: properties the spec defines that no response carried
 *
 * Read-only by allowlist, not by method: several GET endpoints write
 * (createSolutionFromRecord, exportSolutionToRecord, generateDocument, ...).
 * The report holds property names, JSON types and counts, never values or
 * IDs, so it is safe to share whatever realm it ran against.
 *
 * Environment:
 *   QB_REALM        realm hostname, e.g. example.quickbase.com
 *   QB_USER_TOKEN   user token with access to the app
 *   QB_APP_ID       app to walk
 *   QB_APP_TOKEN    optional, for apps that require one
 *   QB_MAX_CALLS    call budget, default 150; the walk stops there and
 *                   reports what it saw
 *   QB_MAX_TABLES   tables to read fields and reports from, default 15
 *
 * The budget matters on client realms: walking every table and report of a
 * large app is thousands of calls. The walk spends it on breadth of shapes
 * first (fields and reports per table), then one getField per field
 * type/mode and one getReport per report type across the app, then the
 * per-table calls whose shape doesn't vary, on a few tables.
 */

import { readJson, writeJson, PATHS, log } from './common.js';
import { join } from 'path';

interface Schema {
  type?: string;
  $ref?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
}

interface OpenAPISpec {
  paths: Record<string, Record<string, { operationId?: string; responses?: Record<string, { content?: Record<string, { schema: Schema }> }> }>>;
  components?: { schemas?: Record<string, Schema> };
}

/** Operations this tool may call. Each only reads. */
const READ_ONLY = new Set([
  'getApp',
  'getAppEvents',
  'getRoles',
  'getAppTables',
  'getTable',
  'getRelationships',
  'getTableReports',
  'getReport',
  'getFields',
  'getField',
  'getFieldsUsage',
  'getFieldUsage',
  'getTrustees',
]);

/** Pause between calls: QuickBase allows 100 requests per 10 seconds per user token. */
const PAUSE_MS = 250;

const DEFAULT_MAX_CALLS = 150;
const DEFAULT_MAX_TABLES = 15;
/** Tables that get the per-table calls whose response shape doesn't vary */
const DETAIL_TABLES = 3;

class BudgetExhausted extends Error {}

/** Per property path, per operation */
interface Finding {
  undocumented: Map<string, { types: Set<string>; count: number }>;
  mismatched: Map<string, { want: string; got: Set<string>; count: number }>;
  documented: Set<string>;
  seen: Set<string>;
  responses: number;
}

export interface AuditReport {
  operations: Record<
    string,
    {
      responses: number;
      undocumented: { path: string; types: string[]; count: number }[];
      typeMismatches: { path: string; spec: string; returned: string[]; count: number }[];
      neverSeen: string[];
    }
  >;
}

function jsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(want: string | undefined, got: string): boolean {
  if (!want || got === 'null') return true;
  if (want === got) return true;
  if (want === 'number' && got === 'integer') return true;
  return false;
}

class Auditor {
  private findings = new Map<string, Finding>();

  constructor(private spec: OpenAPISpec) {}

  private resolve(schema: Schema | undefined): Schema | undefined {
    let s = schema;
    for (let i = 0; s?.$ref && i < 10; i++) {
      const name = s.$ref.replace('#/components/schemas/', '');
      s = this.spec.components?.schemas?.[name];
    }
    if (!s) return s;
    // Merge composed schemas' properties so a value is checked against all of them
    const parts = [...(s.allOf ?? []), ...(s.oneOf ?? []), ...(s.anyOf ?? [])];
    if (parts.length === 0) return s;
    const merged: Schema = { ...s, properties: { ...(s.properties ?? {}) } };
    for (const p of parts) {
      const r = this.resolve(p);
      if (r?.properties) Object.assign(merged.properties!, r.properties);
      if (!merged.type && r?.type) merged.type = r.type;
      if (!merged.items && r?.items) merged.items = r.items;
    }
    return merged;
  }

  responseSchema(operationId: string): Schema | undefined {
    for (const item of Object.values(this.spec.paths)) {
      for (const op of Object.values(item)) {
        if (op.operationId === operationId) {
          return op.responses?.['200']?.content?.['application/json']?.schema;
        }
      }
    }
    return undefined;
  }

  private finding(op: string): Finding {
    let f = this.findings.get(op);
    if (!f) {
      f = { undocumented: new Map(), mismatched: new Map(), documented: new Set(), seen: new Set(), responses: 0 };
      this.findings.set(op, f);
    }
    return f;
  }

  record(op: string, body: unknown): void {
    const f = this.finding(op);
    f.responses++;
    this.walk(f, this.resolve(this.responseSchema(op)), body, '$');
  }

  private walk(f: Finding, schema: Schema | undefined, value: unknown, path: string): void {
    if (!schema || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      const items = this.resolve(schema.items);
      for (const v of value) this.walk(f, items, v, `${path}[]`);
      return;
    }
    if (typeof value !== 'object') return;

    const obj = value as Record<string, unknown>;
    const props = schema.properties ?? {};
    for (const name of Object.keys(props)) f.documented.add(`${path}.${name}`);

    for (const [key, v] of Object.entries(obj)) {
      const prop = this.resolve(props[key]);
      if (prop) {
        const p = `${path}.${key}`;
        f.seen.add(p);
        const got = jsonType(v);
        if (!typeMatches(prop.type, got)) {
          const m = f.mismatched.get(p) ?? { want: prop.type!, got: new Set<string>(), count: 0 };
          m.got.add(got);
          m.count++;
          f.mismatched.set(p, m);
        }
        this.walk(f, prop, v, p);
      } else if (typeof schema.additionalProperties === 'object') {
        // A map with schema'd values (keys are data, e.g. field IDs)
        this.walk(f, this.resolve(schema.additionalProperties), v, `${path}.{key}`);
      } else {
        this.undocumented(f, `${path}.${key}`, v);
      }
    }
  }

  /** Record an undocumented value and, for objects and arrays, the shape inside it. */
  private undocumented(f: Finding, path: string, value: unknown): void {
    const u = f.undocumented.get(path) ?? { types: new Set<string>(), count: 0 };
    u.types.add(jsonType(value));
    u.count++;
    f.undocumented.set(path, u);
    if (Array.isArray(value)) {
      for (const v of value) if (v !== null && typeof v === 'object') this.undocumented(f, `${path}[]`, v);
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        // Keys that are data (field IDs, record IDs) collapse to one path
        this.undocumented(f, /^\d+$/.test(k) ? `${path}.{id}` : `${path}.${k}`, v);
      }
    }
  }

  report(): AuditReport {
    const out: AuditReport = { operations: {} };
    for (const [op, f] of [...this.findings].sort(([a], [b]) => a.localeCompare(b))) {
      // A documented property under an undocumented parent isn't "never seen"
      const visited = [...f.documented].filter((p) => {
        const parent = p.slice(0, p.lastIndexOf('.'));
        return parent === '$' || parent.endsWith('[]') || f.seen.has(parent) || f.seen.has(parent.replace(/\[\]$/, ''));
      });
      out.operations[op] = {
        responses: f.responses,
        undocumented: [...f.undocumented]
          .map(([path, u]) => ({ path, types: [...u.types].sort(), count: u.count }))
          .sort((a, b) => a.path.localeCompare(b.path)),
        typeMismatches: [...f.mismatched]
          .map(([path, m]) => ({ path, spec: m.want, returned: [...m.got].sort(), count: m.count }))
          .sort((a, b) => a.path.localeCompare(b.path)),
        neverSeen: visited.filter((p) => !f.seen.has(p)).sort(),
      };
    }
    return out;
  }
}

class Client {
  calls = 0;

  constructor(
    private realm: string,
    private userToken: string,
    private maxCalls: number,
    private appToken?: string
  ) {}

  async get(operationId: string, path: string, query: Record<string, string> = {}): Promise<unknown> {
    if (!READ_ONLY.has(operationId)) {
      throw new Error(`${operationId} is not on the read-only allowlist`);
    }
    if (this.calls >= this.maxCalls) {
      throw new BudgetExhausted(`call budget of ${this.maxCalls} reached`);
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
    const url = new URL(`https://api.quickbase.com/v1${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const headers: Record<string, string> = {
      'QB-Realm-Hostname': this.realm,
      Authorization: `QB-USER-TOKEN ${this.userToken}`,
      'User-Agent': 'quickbase-spec-audit-live',
    };
    if (this.appToken) headers['QB-App-Token'] = this.appToken;
    this.calls++;
    if (this.calls % 25 === 0) log('info', `${this.calls} calls`);
    const resp = await fetch(url, { method: 'GET', headers });
    if (!resp.ok) {
      throw new Error(`${operationId}: HTTP ${resp.status}`);
    }
    return resp.json();
  }
}

type Row = Record<string, unknown>;

/**
 * Walk one app within the client's call budget. Returns normally when the
 * budget runs out; the auditor keeps everything seen so far.
 */
async function walkApp(client: Client, auditor: Auditor, appId: string, maxTables: number): Promise<void> {
  const call = async (op: string, path: string, query: Record<string, string> = {}): Promise<unknown> => {
    try {
      const body = await client.get(op, path, query);
      auditor.record(op, body);
      return body;
    } catch (error) {
      if (error instanceof BudgetExhausted) throw error;
      log('warn', `${error}`);
      return undefined;
    }
  };

  try {
    await call('getApp', `/apps/${appId}`);
    await call('getRoles', `/apps/${appId}/roles`);
    await call('getAppEvents', `/apps/${appId}/events`);
    await call('getTrustees', `/app/${appId}/trustees`);
    const tables = (((await call('getAppTables', '/tables', { appId })) as Row[] | undefined) ?? []).slice(0, maxTables);

    // Breadth: every sampled table's fields and reports
    const fieldKinds = new Map<string, { tableId: string; fieldId: unknown }>();
    const reportTypes = new Map<string, { tableId: string; reportId: unknown }>();
    const firstField = new Map<string, unknown>();
    for (const table of tables) {
      const tableId = String(table.id);
      const fields = ((await call('getFields', '/fields', { tableId })) as Row[] | undefined) ?? [];
      for (const f of fields) {
        const kind = `${f.fieldType}/${f.mode ?? ''}`;
        if (!fieldKinds.has(kind)) fieldKinds.set(kind, { tableId, fieldId: f.id });
      }
      if (fields.length > 0) firstField.set(tableId, fields[0].id);
      const reports = ((await call('getTableReports', '/reports', { tableId })) as Row[] | undefined) ?? [];
      for (const r of reports) {
        const type = String(r.type);
        if (!reportTypes.has(type)) reportTypes.set(type, { tableId, reportId: r.id });
      }
    }

    // One of each field kind and report type, across the app
    for (const { tableId, fieldId } of fieldKinds.values()) {
      await call('getField', `/fields/${fieldId}`, { tableId });
    }
    for (const { tableId, reportId } of reportTypes.values()) {
      await call('getReport', `/reports/${reportId}`, { tableId });
    }

    // Calls whose shape doesn't vary by table, on a few tables
    for (const table of tables.slice(0, DETAIL_TABLES)) {
      const tableId = String(table.id);
      await call('getTable', `/tables/${tableId}`, { appId });
      await call('getRelationships', `/tables/${tableId}/relationships`);
      await call('getFieldsUsage', '/fields/usage', { tableId });
      if (firstField.has(tableId)) {
        await call('getFieldUsage', `/fields/usage/${firstField.get(tableId)}`, { tableId });
      }
    }
  } catch (error) {
    if (!(error instanceof BudgetExhausted)) throw error;
    log('warn', `${error.message}; reporting what was seen`);
  }
}

function printReport(report: AuditReport, calls: number): void {
  const lines: string[] = [`Live audit: ${calls} calls`, ''];
  for (const [op, r] of Object.entries(report.operations)) {
    if (r.undocumented.length === 0 && r.typeMismatches.length === 0 && r.neverSeen.length === 0) {
      lines.push(`${op} (${r.responses}): matches the spec`);
      continue;
    }
    lines.push(`${op} (${r.responses} responses)`);
    for (const u of r.undocumented) lines.push(`  undocumented   ${u.path}  ${u.types.join('|')}  x${u.count}`);
    for (const m of r.typeMismatches) lines.push(`  type mismatch  ${m.path}  spec ${m.spec}, returned ${m.returned.join('|')}  x${m.count}`);
    if (r.neverSeen.length > 0) lines.push(`  never seen     ${r.neverSeen.length} documented properties (see JSON report)`);
  }
  console.log(lines.join('\n'));
}

export async function auditLive(outPath?: string): Promise<AuditReport> {
  const realm = process.env.QB_REALM;
  const userToken = process.env.QB_USER_TOKEN;
  const appId = process.env.QB_APP_ID;
  if (!realm || !userToken || !appId) {
    throw new Error('Set QB_REALM, QB_USER_TOKEN and QB_APP_ID');
  }

  const spec = readJson<OpenAPISpec>(join(PATHS.output, 'quickbase-patched.json'));
  const auditor = new Auditor(spec);
  const maxCalls = Number(process.env.QB_MAX_CALLS ?? DEFAULT_MAX_CALLS);
  const maxTables = Number(process.env.QB_MAX_TABLES ?? DEFAULT_MAX_TABLES);
  if (!(maxCalls > 0) || !(maxTables > 0)) {
    throw new Error('QB_MAX_CALLS and QB_MAX_TABLES must be positive numbers');
  }
  const client = new Client(realm, userToken, maxCalls, process.env.QB_APP_TOKEN);

  const finish = (): AuditReport => {
    const report = auditor.report();
    printReport(report, client.calls);
    if (outPath) {
      writeJson(outPath, report);
      log('info', `Wrote ${outPath}`);
    }
    return report;
  };
  // Stopped by hand: still report what was seen and how many calls it took
  process.once('SIGINT', () => {
    log('warn', 'interrupted');
    finish();
    process.exit(130);
  });

  log('info', `Budget: ${maxCalls} calls, up to ${maxTables} tables`);
  await walkApp(client, auditor, appId, maxTables);
  return finish();
}
