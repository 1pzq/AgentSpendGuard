import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";

const DATA_DIR = process.env.SPENDGUARD_DATA_DIR ?? join(process.cwd(), ".spendguard");

function pathFor(fileName: string) {
  return join(DATA_DIR, fileName);
}

export function readJsonFile<T>(fileName: string, fallback: T): T {
  const filePath = pathFor(fileName);

  if (!existsSync(filePath)) return fallback;

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    console.warn(`Unable to read SpendGuard data file ${filePath}.`, error);
    return fallback;
  }
}

export function writeJsonFile(fileName: string, data: unknown) {
  const filePath = pathFor(fileName);
  const tmpPath = `${filePath}.${Date.now()}.tmp`;

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tmpPath, filePath);
}
