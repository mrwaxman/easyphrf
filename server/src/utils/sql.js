'use strict';

/**
 * Build a parameterized `SET` clause from a plain object of column->value.
 * Returns the clause, the ordered values, and the next positional index so the
 * caller can append WHERE parameters.
 *
 *   const { clause, values, nextIndex } = buildUpdate({ name: 'x', active: false });
 *   // clause: "name = $1, active = $2"; values: ['x', false]; nextIndex: 3
 */
function buildUpdate(fields) {
  const keys = Object.keys(fields);
  const clause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map((k) => fields[k]);
  return { clause, values, nextIndex: keys.length + 1, isEmpty: keys.length === 0 };
}

module.exports = { buildUpdate };
