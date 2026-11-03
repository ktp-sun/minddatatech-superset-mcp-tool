import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const ENV_JSON_PATH = path.join(PROJECT_ROOT, 'env.json');
export const CONFIG_JSON_PATH = path.join(PROJECT_ROOT, 'config.json');

export const DEFAULT_SUPERSET_URL = 'https://superset.minddatatech.com';
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export function getConfigFile() {
  if (fs.existsSync(ENV_JSON_PATH)) return ENV_JSON_PATH;
  if (fs.existsSync(CONFIG_JSON_PATH)) return CONFIG_JSON_PATH;
  return ENV_JSON_PATH;
}

export function readConfigFile() {
  const filePath = getConfigFile();
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Warning: Failed to parse ${filePath}:`, err.message);
    return {};
  }
}

export function writeConfigFile(data) {
  const filePath = getConfigFile();
  const existing = readConfigFile();
  const merged = { ...existing, ...data };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
  return filePath;
}
