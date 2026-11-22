const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const target = path.join(root, 'target', process.platform + '-' + process.arch);
const library = {
  win32:'lanebreak_node.dll', darwin:'liblanebreak_node.dylib', linux:'liblanebreak_node.so'
}[process.platform];
if (!library) throw new Error('Native engine builds support Windows, macOS, and Linux.');
function buildRust(pkg, profile, ...options) {
  const result = spawnSync('cargo', ['build', '--locked', '--profile', profile, '--target-dir', target, '-p', pkg, ...options],
    { cwd:root, stdio:'inherit' });
  if (result.error) throw new Error('Run this build with Cargo on PATH. See README.md.', { cause:result.error });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
buildRust('lanebreak-node', 'release');
buildRust('lanebreak-engine', 'wasm-release', '--target', 'wasm32-unknown-unknown');
const binary = fs.readFileSync(path.join(target, 'release', library));
const filename = 'lanebreak_engine-' + createHash('sha256').update(binary).digest('hex').slice(0, 16) + '.node';
const addon = path.join(target, filename);
if (!fs.existsSync(addon)) fs.writeFileSync(addon, binary);
const wasm = fs.readFileSync(path.join(target, 'wasm32-unknown-unknown', 'wasm-release', 'lanebreak_engine.wasm')).toString('base64');
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8').trimEnd();
const scripts = '<script>const LanebreakEngineWasm = ' + JSON.stringify(wasm) + ';\n' +
  'globalThis.LanebreakRules = ' + JSON.stringify(require('./src/rules.json')).replaceAll('<', '\\u003c') + ';</script>\n' +
  ['match.js', 'game-view.js', 'sprite-batch.js', 'paint.js', 'client.js']
  .map(file => '<script>\n' + read(file) + '\n</script>').join('\n');
const html = read('page.html')
  .replace('<!-- STYLE -->', () => '<style>\n' + read('style.css') + '\n</style>')
  .replace('<!-- SCRIPTS -->', () => scripts);
fs.writeFileSync(path.join(root, 'lanebreak.html'), html + '\n');
fs.writeFileSync(path.join(target, 'engine-addon.txt'), filename + '\n');
