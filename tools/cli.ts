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

      case 'health':
      case 'check': {
        const { healthCheck } = await import('./health-check.js');
        const result = await healthCheck();
        if (!result.valid) {
          process.exit(1);
        }
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
  build [input]     Run full pipeline (convert -> patch -> validate)
  health            Validate fixtures against spec (alias: check)

Examples:
  npx tsx tools/cli.ts build
  npx tsx tools/cli.ts validate ./my-spec.json
  npx tsx tools/cli.ts health
`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
