const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const target = path.join(root, 'target', process.platform + '-' + process.arch);
const library = {
  win32:'lanebreak_node.dll', darwin:'liblanebreak_node.dylib', linux:'liblanebreak_node.so'
}[process.platform];
if (!library) throw new Error('Native physics builds support Windows, macOS, and Linux.');
function buildRust(pkg, ...options) {
  const result = spawnSync('cargo', ['build', '--locked', '--release', '--target-dir', target, '-p', pkg, ...options],
    { cwd:root, stdio:'inherit' });
  if (result.error) throw new Error('Run this build with Cargo on PATH. See README.md.', { cause:result.error });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
buildRust('lanebreak-node');
buildRust('lanebreak-physics', '--target', 'wasm32-unknown-unknown');
const binary = fs.readFileSync(path.join(target, 'release', library));
const filename = 'lanebreak_physics-' + createHash('sha256').update(binary).digest('hex').slice(0, 16) + '.node';
const addon = path.join(target, filename);
if (!fs.existsSync(addon)) fs.writeFileSync(addon, binary);
const wasm = fs.readFileSync(path.join(target, 'wasm32-unknown-unknown', 'release', 'lanebreak_physics.wasm')).toString('base64');
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8').trimEnd();
const scripts = '<script>const LanebreakPhysicsWasm = ' + JSON.stringify(wasm) + ';</script>\n' +
  ['rules.js', 'physics.js', 'engine.js', 'paint.js', 'client.js']
  .map(file => '<script>\n' + read(file) + '\n</script>').join('\n');
const html = read('page.html')
  .replace('<!-- STYLE -->', () => '<style>\n' + read('style.css') + '\n</style>')
  .replace('<!-- SCRIPTS -->', () => scripts);
fs.writeFileSync(path.join(root, 'lanebreak.html'), html + '\n');
fs.writeFileSync(path.join(target, 'physics-addon.txt'), filename + '\n');
