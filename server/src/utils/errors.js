'use strict';

/** An error carrying an HTTP status and optional machine-readable details. */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const unauthorized = (message = 'Unauthorized') => new HttpError(401, message);
const notFound = (message = 'Not found') => new HttpError(404, message);
const conflict = (message, details) => new HttpError(409, message, details);

/** Wrap an async route handler so thrown/rejected errors reach next(). */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  notFound,
  conflict,
  asyncHandler,
};
