// Compile the real routes with this project's TS aliases. No HTTP or fs mocks:
// integration tests point the normal file loaders at an isolated data fixture.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
module.exports = function makeLoader() {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module);
    mod.filename = file;
    mod.paths = Module._nodeModulePaths(path.dirname(file));
    cache.set(file, mod);
    const normalRequire = mod.require.bind(mod);
    mod.require = (name) => {
      const local = name.startsWith('@shared/') ? path.join(root, '../diary/shared', name.slice(8))
        : name.startsWith('@/') ? path.join(root, name.slice(2))
        : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null;
      if (local) {
        const candidate = [local, `${local}.ts`, `${local}.tsx`].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
        if (candidate && /\.tsx?$/.test(candidate)) return load(candidate);
      }
      return normalRequire(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
    }).outputText, file);
    return mod.exports;
  }
  return load;
};
