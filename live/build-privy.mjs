import {build} from './privy-client/node_modules/esbuild/lib/main.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
const root=path.dirname(fileURLToPath(import.meta.url));
await build({entryPoints:[path.join(root,'privy-entry.jsx')],outfile:path.join(root,'web/privy.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,nodePaths:[path.join(root,'privy-client/node_modules')],define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
const styles=await Promise.all(['../ui/assets/fonts.css','../ui/complete.css','web/radar.css','web/journey.css','web/bell.css'].map(file=>readFile(path.join(root,file),'utf8')));
await build({stdin:{contents:styles.join(String.fromCharCode(10)),loader:'css',resolveDir:root},outfile:path.join(root,'web/app.css'),minify:true,logLevel:'warning'});
await build({entryPoints:[path.join(root,'web/app.js')],outfile:path.join(root,'web/app.bundle.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,sourcemap:true,external:['/privy.js'],logLevel:'warning'});
