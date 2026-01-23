const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const LOG_FILE = path.join(DATA_DIR, 'transaction-logs.json');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJsonFile() {
  try {
    const content = await fs.readFile(LOG_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeJsonFile(data) {
  await ensureDataDir();
  await fs.writeFile(LOG_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  readJsonFile,
  writeJsonFile,
};
