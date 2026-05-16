const esbuild = require('esbuild');
const path = require('path');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: path.join(__dirname, '../dist/index.js'),
  external: ['@aws-sdk/*'],
  minify: false,
  sourcemap: false,
});

console.log('Bundle complete: dist/index.js');
