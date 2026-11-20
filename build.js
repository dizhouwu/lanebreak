const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8').trimEnd();
const scripts = ['rules.js', 'engine.js', 'paint.js', 'client.js']
  .map(file => '<script>\n' + read(file) + '\n</script>').join('\n');
const html = read('page.html')
  .replace('<!-- STYLE -->', () => '<style>\n' + read('style.css') + '\n</style>')
  .replace('<!-- SCRIPTS -->', () => scripts);
fs.writeFileSync(path.join(root, 'lanebreak.html'), html + '\n');
