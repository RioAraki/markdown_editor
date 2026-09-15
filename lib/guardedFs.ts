import fs from 'node:fs';
import promises from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSandboxPath } from './serverPaths';

// Keep Node's overloads intact. Validate each actual path at operation time,
// rather than relying on directory constants checked when a module was loaded.
const singlePath = new Set(['access', 'appendFile', 'chmod', 'chown', 'createReadStream', 'createWriteStream',
  'exists', 'lchmod', 'lchown', 'lstat', 'lutimes', 'mkdir', 'mkdtemp', 'open', 'opendir',
  'readFile', 'readdir', 'readlink', 'realpath', 'rm', 'rmdir', 'stat', 'statfs', 'truncate',
  'unlink', 'utimes', 'watch', 'watchFile', 'writeFile']);
const twoPaths = new Set(['copyFile', 'cp', 'link', 'rename', 'symlink']);

function check(value: unknown) {
  if (typeof value === 'string') assertSandboxPath(value);
  else if (Buffer.isBuffer(value)) assertSandboxPath(value.toString());
  else if (value instanceof URL) assertSandboxPath(fileURLToPath(value));
  // File descriptors/handles originate from an already checked open operation.
}

function guard<T extends object>(source: T): T {
  return new Proxy(source, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      const name = String(key).replace(/Sync$/, '');
      if (typeof value !== 'function' || (!singlePath.has(name) && !twoPaths.has(name))) return value;
      return (...args: unknown[]) => {
        check(args[0]);
        if (twoPaths.has(name)) check(args[1]);
        return Reflect.apply(value, target, args);
      };
    },
  });
}

export const guardedFs = guard(fs);
export const guardedPromises = guard(promises);
export const createReadStream = guardedFs.createReadStream;
