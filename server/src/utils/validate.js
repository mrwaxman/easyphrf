'use strict';

const { badRequest } = require('./errors');

/** Throw 400 if any of `fields` is missing/blank on `body`. */
function requireFields(body, fields) {
  const missing = fields.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === ''
  );
  if (missing.length) {
    throw badRequest(`Missing required fields: ${missing.join(', ')}`, { missing });
  }
}

/** Throw 400 if a present value is not in the allowed set. */
function ensureEnum(value, allowed, name) {
  if (value !== undefined && value !== null && !allowed.includes(value)) {
    throw badRequest(`Invalid ${name}: ${value}`, { allowed });
  }
}

/** Pick only the named keys that are present (not undefined) from an object. */
function pickDefined(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

module.exports = { requireFields, ensureEnum, pickDefined };
