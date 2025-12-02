/**
 * Convert Swagger 2.0 to OpenAPI 3.0
 *
 * QuickBase's official spec is Swagger 2.0, but OpenAPI 3.0
 * provides better tooling support and cleaner schema definitions.
 */

import { readJson, writeJson, PATHS, log, runTask, findSourceSpec } from './common.js';
import { join } from 'path';
import { existsSync } from 'fs';

interface Swagger2Spec {
  swagger: string;
  info: { title: string; version: string };
  host: string;
  basePath: string;
  schemes: string[];
  paths: Record<string, unknown>;
  definitions?: Record<string, unknown>;
}

interface OpenAPI3Spec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: Array<{ url: string; description?: string }>;
  paths: Record<string, unknown>;
  components: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
  security?: Array<Record<string, string[]>>;
  tags?: Array<{ name: string; description?: string }>;
}

/**
 * Convert Swagger 2.0 parameter to OpenAPI 3.0
 */
function convertParameter(param: Record<string, unknown>): Record<string, unknown> {
  // Body parameters become requestBody in OpenAPI 3.0
  if (param.in === 'body') {
    return param; // Handled separately
  }

  const converted: Record<string, unknown> = {
    name: param.name,
    in: param.in,
    description: param.description,
    required: param.required ?? false,
  };

  // Convert type to schema
  if (param.type) {
    converted.schema = {
      type: param.type,
    };

    if (param.format) {
      (converted.schema as Record<string, unknown>).format = param.format;
    }
    if (param.enum) {
      (converted.schema as Record<string, unknown>).enum = param.enum;
    }
    if (param.default !== undefined) {
      (converted.schema as Record<string, unknown>).default = param.default;
    }
  }

  // Handle schema reference
  if (param.schema) {
    converted.schema = convertSchemaRef(param.schema as Record<string, unknown>);
  }

  return converted;
}

/**
 * Convert schema $ref from Swagger 2.0 to OpenAPI 3.0 format
 */
function convertSchemaRef(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.$ref && typeof schema.$ref === 'string') {
    // Convert #/definitions/Foo to #/components/schemas/Foo
    return {
      $ref: schema.$ref.replace('#/definitions/', '#/components/schemas/'),
    };
  }

  // Handle array items
  if (schema.type === 'array' && schema.items) {
    return {
      ...schema,
      items: convertSchemaRef(schema.items as Record<string, unknown>),
    };
  }

  // Handle object properties
  if (schema.properties) {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      properties[key] = convertSchemaRef(value as Record<string, unknown>);
    }
    return { ...schema, properties };
  }

  // Handle allOf, oneOf, anyOf
  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[key])) {
      return {
        ...schema,
        [key]: (schema[key] as unknown[]).map((s) =>
          convertSchemaRef(s as Record<string, unknown>)
        ),
      };
    }
  }

  return schema;
}

/**
 * Convert Swagger 2.0 operation to OpenAPI 3.0
 */
function convertOperation(
  operation: Record<string, unknown>,
  path: string,
  method: string
): Record<string, unknown> {
  const converted: Record<string, unknown> = {
    operationId: operation.operationId,
    summary: operation.summary,
    description: operation.description,
    tags: operation.tags,
  };

  // Convert parameters
  const parameters = operation.parameters as Array<Record<string, unknown>> | undefined;
  if (parameters) {
    const nonBodyParams = parameters.filter((p) => p.in !== 'body');
    const bodyParam = parameters.find((p) => p.in === 'body');

    if (nonBodyParams.length > 0) {
      converted.parameters = nonBodyParams.map(convertParameter);
    }

    // Convert body parameter to requestBody
    if (bodyParam) {
      converted.requestBody = {
        description: bodyParam.description,
        required: bodyParam.required ?? false,
        content: {
          'application/json': {
            schema: convertSchemaRef(bodyParam.schema as Record<string, unknown>),
          },
        },
      };
    }
  }

  // Convert responses
  const responses = operation.responses as Record<string, Record<string, unknown>> | undefined;
  if (responses) {
    converted.responses = {};

    for (const [statusCode, response] of Object.entries(responses)) {
      const convertedResponse: Record<string, unknown> = {
        description: response.description || 'Response',
      };

      if (response.schema) {
        convertedResponse.content = {
          'application/json': {
            schema: convertSchemaRef(response.schema as Record<string, unknown>),
          },
        };
      }

      (converted.responses as Record<string, unknown>)[statusCode] = convertedResponse;
    }
  }

  return converted;
}

/**
 * Convert entire Swagger 2.0 spec to OpenAPI 3.0
 */
export function convertSwaggerToOpenAPI(swagger: Swagger2Spec): OpenAPI3Spec {
  const scheme = swagger.schemes?.[0] || 'https';
  const baseUrl = `${scheme}://${swagger.host}${swagger.basePath}`;

  const openapi: OpenAPI3Spec = {
    openapi: '3.0.3',
    info: {
      title: swagger.info.title,
      version: swagger.info.version,
      description: 'QuickBase JSON RESTful API',
    },
    servers: [
      {
        url: baseUrl.replace('//', '/').replace(':/', '://'),
        description: 'QuickBase API',
      },
    ],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        userToken: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header',
          description: 'User token: QB-USER-TOKEN {token}',
        },
        tempToken: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header',
          description: 'Temporary token: QB-TEMP-TOKEN {token}',
        },
      },
    },
    security: [{ userToken: [] }],
  };

  // Convert paths
  for (const [path, pathItem] of Object.entries(swagger.paths)) {
    const convertedPath: Record<string, unknown> = {};

    for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
      const operation = (pathItem as Record<string, unknown>)[method];
      if (operation) {
        convertedPath[method] = convertOperation(
          operation as Record<string, unknown>,
          path,
          method
        );
      }
    }

    openapi.paths[path] = convertedPath;
  }

  // Convert definitions to components/schemas
  if (swagger.definitions) {
    for (const [name, schema] of Object.entries(swagger.definitions)) {
      openapi.components.schemas![name] = convertSchemaRef(schema as Record<string, unknown>);
    }
  }

  return openapi;
}

/**
 * Main convert function
 */
export async function convert(inputPath?: string): Promise<void> {
  await runTask('Convert Swagger 2.0 to OpenAPI 3.0', async () => {
    // Find input file
    let input = inputPath;

    if (!input) {
      // Try to find source spec
      input = findSourceSpec() ?? undefined;
    }

    if (!input || !existsSync(input)) {
      throw new Error(
        `Input file not found. Either provide a path or place the Swagger spec in ${PATHS.source}/quickbase-swagger.json`
      );
    }

    log('info', `Reading spec from: ${input}`);

    // Read Swagger spec
    const swagger = readJson<Swagger2Spec>(input);

    if (swagger.swagger !== '2.0') {
      log('warn', `Expected Swagger 2.0, got: ${swagger.swagger || swagger.openapi || 'unknown'}`);
    }

    // Convert
    const openapi = convertSwaggerToOpenAPI(swagger);

    // Write output
    const outputPath = join(PATHS.output, 'quickbase-openapi3.json');
    writeJson(outputPath, openapi);

    log('info', `Wrote OpenAPI 3.0 spec to: ${outputPath}`);
    log('info', `Paths: ${Object.keys(openapi.paths).length}`);
    log('info', `Schemas: ${Object.keys(openapi.components.schemas || {}).length}`);
  });
}
