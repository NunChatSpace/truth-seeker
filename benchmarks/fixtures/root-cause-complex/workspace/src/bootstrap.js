const { resolveVersion } = require('./version-provider');

function boot() {
  return { version: resolveVersion() };
}

module.exports = { boot };
