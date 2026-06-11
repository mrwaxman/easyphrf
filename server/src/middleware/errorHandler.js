'use strict';

const { HttpError } = require('../utils/errors');

/* eslint-disable no-unused-vars */
/** Central Express error handler. Maps HttpError to its status; else 500. */
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.details !== undefined) body.details = err.details;
    return res.status(err.status).json(body);
  }

  // Surface DB unique-violation style errors as 409 where we can detect them.
  if (err && /duplicate key|unique/i.test(err.message || '')) {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { errorHandler };
