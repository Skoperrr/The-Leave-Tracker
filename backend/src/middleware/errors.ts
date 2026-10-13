import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../utils/api-error.js';

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  let safeError: ApiError;
  if (error instanceof ApiError) {
    safeError = error;
  } else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.parse.failed') {
    safeError = new ApiError(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
  } else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    safeError = new ApiError(400, 'VALIDATION_ERROR', 'Request body exceeds the size limit');
  } else {
    // Do not log exception text, request bodies, tokens, or connection strings.
    console.error('Unhandled API error');
    safeError = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
  response.status(safeError.status).json({ error: {
    code: safeError.code, message: safeError.message, details: safeError.details,
  } });
};
