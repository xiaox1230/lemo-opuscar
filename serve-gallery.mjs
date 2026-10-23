// serve-gallery.mjs — 本地风格画廊服务器（复用 core/render/serve.mjs 的静态服务）
// 用法：node serve-gallery.mjs [port]
import { serve } from './core/render/serve.mjs';
import path from 'path';
const want = Number(process.argv[2] || 4321);
const root = path.resolve('.');
let port = want, srv;
for (let i = 0; i < 8; i++) {
  try { srv = await serve(root, port); break; }
  catch (e) { port += 1; }
}
if (!srv) { console.error('no free port'); process.exit(1); }
console.log(`styleboard  http://127.0.0.1:${srv.port}/styleboard/index.html`);
console.log(`opuscar98   http://127.0.0.1:${srv.port}/styleboard/opuscar98.html`);
console.log(`root        ${root}`);
