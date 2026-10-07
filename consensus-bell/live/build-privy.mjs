import {build} from './privy-client/node_modules/esbuild/lib/main.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
await build({entryPoints:[path.join(root,'privy-entry.jsx')],outfile:path.join(root,'web/privy.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,nodePaths:[path.join(root,'privy-client/node_modules')],define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
