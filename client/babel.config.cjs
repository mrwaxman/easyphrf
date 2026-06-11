'use strict';

// Used by Jest (babel-jest) to transform JSX/ESM in tests.
// Vite uses its own esbuild-based transform and ignores this file.
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
};
