const fs = require('node:fs');

function displayedVersion() {
  return fs.readFileSync('config/version.txt', 'utf8').trim();
}

console.log(displayedVersion());
