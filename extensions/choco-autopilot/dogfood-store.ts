import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DogfoodCase, DogfoodWeeklyReport } from "./dogfood-types";

export interface DogfoodStore {
  root: string;
  casesDir: string;
  weeklyDir: string;
  eventsPath: string;
  queuePath: string;
}

export function createDogfoodStore(root: string): DogfoodStore {
  return {
    root,
    casesDir: join(root, "cases"),
    weeklyDir: join(root, "weekly"),
    eventsPath: join(root, "events.jsonl"),
    queuePath: join(root, "review-queue.json"),
  };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeDogfoodCase(store: DogfoodStore, dogfoodCase: DogfoodCase): Promise<void> {
  await mkdir(store.casesDir, { recursive: true });
  await writeJsonAtomic(join(store.casesDir, `${dogfoodCase.id}.json`), dogfoodCase);
}

export async function listDogfoodCases(store: DogfoodStore, week?: string): Promise<DogfoodCase[]> {
  try {
    const files = (await readdir(store.casesDir)).filter((file) => file.endsWith(".json"));
    const cases = await Promise.all(files.map((file) => readJson<DogfoodCase | undefined>(join(store.casesDir, file), undefined)));
    return cases
      .filter((item): item is DogfoodCase => Boolean(item))
      .filter((item) => !week || item.week === week)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function appendDogfoodEvent(store: DogfoodStore, event: Record<string, unknown>): Promise<void> {
  await mkdir(store.root, { recursive: true });
  await appendFile(store.eventsPath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readDogfoodQueue(store: DogfoodStore): Promise<DogfoodCase[]> {
  return readJson<DogfoodCase[]>(store.queuePath, []);
}

export async function writeDogfoodQueue(store: DogfoodStore, cases: DogfoodCase[]): Promise<void> {
  await writeJsonAtomic(store.queuePath, cases);
}

export async function writeDogfoodWeeklyReport(store: DogfoodStore, report: DogfoodWeeklyReport): Promise<void> {
  await mkdir(store.weeklyDir, { recursive: true });
  await writeJsonAtomic(join(store.weeklyDir, `${report.week}.json`), report);
}

export async function readDogfoodWeeklyReport(store: DogfoodStore, week: string): Promise<DogfoodWeeklyReport | undefined> {
  return readJson<DogfoodWeeklyReport | undefined>(join(store.weeklyDir, `${week}.json`), undefined);
}

export async function cleanupDogfoodCaseRetention(store: DogfoodStore, now = new Date(), retentionWeeks = 12): Promise<number> {
  const cutoff = now.getTime() - (retentionWeeks * 7 * 24 * 60 * 60 * 1000);
  const cases = await listDogfoodCases(store);
  let removed = 0;
  for (const item of cases) {
    const started = new Date(item.startedAt).getTime();
    if (Number.isFinite(started) && started < cutoff) {
      await rm(join(store.casesDir, `${item.id}.json`), { force: true });
      removed += 1;
    }
  }
  return removed;
}
