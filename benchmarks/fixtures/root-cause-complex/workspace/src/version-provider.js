const fs = require('node:fs');

function resolveVersion() {
  return fs.readFileSync('config/version.txt', 'utf8').trim();
}

module.exports = { resolveVersion };
