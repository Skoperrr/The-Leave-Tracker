import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/api-error.js';

// Handlers consume response.locals.validated, never an unchecked client payload.
export function validate(schema: ZodType, source: 'body' | 'query' | 'params' = 'body'): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid request input', {
        fields: result.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
      }));
      return;
    }
    response.locals.validated = result.data;
    next();
  };
}
