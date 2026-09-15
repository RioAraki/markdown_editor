import { guardedFs as fs } from '@/lib/guardedFs';
import { guardedPromises as io } from '@/lib/guardedFs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertSandboxPath } from './serverPaths';

function temporaryPath(destination: string): string {
  return path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
}

// The existing destination is never truncated or unlinked. A completed, flushed
// temp replaces it in one rename. This does not serialize concurrent writers or
// guarantee directory-entry durability after power loss on every filesystem.
export async function atomicWriteFile(
  destination: string,
  data: string | Uint8Array,
  encoding: BufferEncoding = 'utf8',
): Promise<void> {
  const temp = temporaryPath(destination);
  let owned = false;
  try {
    assertSandboxPath(destination);
    assertSandboxPath(temp);
    const handle = await io.open(temp, 'wx');
    owned = true;
    try {
      await handle.writeFile(data, { encoding });
      await handle.sync();
    } finally {
      await handle.close();
    }
    assertSandboxPath(destination);
    assertSandboxPath(temp);
    await io.rename(temp, destination);
    owned = false;
  } finally {
    if (owned) await io.unlink(temp);
  }
}

export function atomicWriteFileSync(
  destination: string,
  data: string | Uint8Array,
  encoding: BufferEncoding = 'utf8',
): void {
  const temp = temporaryPath(destination);
  let owned = false;
  try {
    assertSandboxPath(destination);
    assertSandboxPath(temp);
    const fd = fs.openSync(temp, 'wx');
    owned = true;
    try {
      fs.writeFileSync(fd, data, { encoding });
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    assertSandboxPath(destination);
    assertSandboxPath(temp);
    fs.renameSync(temp, destination);
    owned = false;
  } finally {
    if (owned) fs.unlinkSync(temp);
  }
}
