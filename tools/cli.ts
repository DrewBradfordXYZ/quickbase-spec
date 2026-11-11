#!/usr/bin/env node
/**
 * CLI for spec tooling
 *
 * Usage:
 *   npx tsx tools/cli.ts <command> [options]
 *
 * Commands:
 *   convert   - Convert Swagger 2.0 to OpenAPI 3.0
 *   patch     - Apply fixes and overrides to spec
 *   validate  - Validate spec structure and references
 *   split     - Split spec by tag for easier editing
 *   build     - Run full pipeline: convert -> patch -> validate
 *   audit-live - Compare a realm's real responses with the spec (read-only)
 *   fetch-upstream - Get QuickBase's current spec from its API portal and diff it
 */

import { log } from './common.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      case 'convert': {
        const { convert } = await import('./convert.js');
        await convert(args[1]);
        break;
      }

      case 'patch': {
        const { patch } = await import('./patch.js');
        await patch(args[1]);
        break;
      }

      case 'validate': {
        const { validate } = await import('./validate.js');
        const result = await validate(args[1]);
        if (!result.valid) {
          process.exit(1);
        }
        break;
      }

      case 'split': {
        const { split } = await import('./split.js');
        await split(args[1]);
        break;
      }

      case 'generate': {
        const { generate } = await import('./generate.js');
        await generate(args[1]);
        break;
      }

      case 'health':
      case 'check': {
        const { healthCheck } = await import('./health-check.js');
        const result = await healthCheck();
        if (!result.valid) {
          process.exit(1);
        }
        break;
      }

      case 'audit-live': {
        const { auditLive } = await import('./audit-live.js');
        await auditLive(args[1]);
        break;
      }

      case 'fetch-upstream': {
        const { fetchUpstream } = await import('./fetch-upstream.js');
        process.exitCode = await fetchUpstream(args.slice(1));
        break;
      }

      case 'build': {
        // Run full pipeline
        log('info', 'Running full build pipeline...\n');

        // Step 1: Convert Swagger 2.0 to OpenAPI 3.0
        const { convert } = await import('./convert.js');
        await convert(args[1]);

        // Step 2: Apply patches
        const { patch } = await import('./patch.js');
        await patch();

        // Step 3: Validate
        const { validate } = await import('./validate.js');
        const result = await validate();

        if (!result.valid) {
          log('error', '\nBuild failed - spec validation errors');
          process.exit(1);
        }

        log('success', '\nBuild completed successfully');
        break;
      }

      case 'help':
      case '--help':
      case '-h':
        printUsage();
        break;

      default:
        log('error', `Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    log('error', `Command failed: ${error}`);
    console.error(error);
    process.exit(1);
  }
}

function printUsage(): void {
  console.log(`
QuickBase OpenAPI Spec Tools

Usage:
  npx tsx tools/cli.ts <command> [options]

Commands:
  convert [input]   Convert Swagger 2.0 to OpenAPI 3.0
  patch [input]     Apply fixes and overrides to spec
  validate [input]  Validate spec structure and references
  split [input]     Split spec by tag for easier editing
  generate [input]  Generate fixtures from spec examples
  build [input]     Run full pipeline (convert -> patch -> validate)
  health            Validate fixtures against spec (alias: check)
  audit-live [out]  Compare a realm's real responses with the spec; read-only.
                    Needs QB_REALM, QB_USER_TOKEN, QB_APP_ID (QB_APP_TOKEN optional).
                    QB_MAX_CALLS caps the calls (default 150), QB_MAX_TABLES
                    the tables sampled (default 15).
  fetch-upstream [--write]
                    Get QuickBase's current spec from developer.quickbase.com and
                    list operations added, removed, renamed or changed. Exits 2
                    when it changed. --write saves it to source/.
                    Writes the JSON report to [out] if given.

Examples:
  npx tsx tools/cli.ts build
  npx tsx tools/cli.ts generate
  npx tsx tools/cli.ts validate ./my-spec.json
  npx tsx tools/cli.ts health
`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
