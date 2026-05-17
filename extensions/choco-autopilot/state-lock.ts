import { mkdir, open, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

export interface FileLockOptions {
  staleMs: number;
  retryMs: number;
  timeoutMs: number;
}

export class FileLockTimeoutError extends Error {
  readonly lockPath: string;

  constructor(lockPath: string, timeoutMs: number) {
    super(`Timed out waiting for file lock ${lockPath} after ${timeoutMs}ms`);
    this.name = "FileLockTimeoutError";
    this.lockPath = lockPath;
  }
}

const DEFAULT_LOCK_OPTIONS: FileLockOptions = {
  staleMs: 30_000,
  retryMs: 10,
  timeoutMs: 5_000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeIfStale(lockPath: string, staleMs: number): Promise<void> {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs >= staleMs) await rm(lockPath, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function withFileLock<T>(targetPath: string, operation: () => Promise<T>, options: Partial<FileLockOptions> = {}): Promise<T> {
  const lockOptions = { ...DEFAULT_LOCK_OPTIONS, ...options };
  const lockPath = `${targetPath}.lock`;
  const startedAt = Date.now();
  await mkdir(dirname(targetPath), { recursive: true });

  while (true) {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      await handle.close();
      handle = undefined;
      try {
        return await operation();
      } finally {
        await rm(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await removeIfStale(lockPath, lockOptions.staleMs);
      if (Date.now() - startedAt >= lockOptions.timeoutMs) throw new FileLockTimeoutError(lockPath, lockOptions.timeoutMs);
      await sleep(lockOptions.retryMs);
    }
  }
}
