const { randomUUID } = require('crypto');
const { readJsonFile, writeJsonFile } = require('../config/database');

class TransactionLog {
  static async create(payload) {
    const logs = await readJsonFile();
    const now = new Date().toISOString();
    const entry = {
      id: randomUUID(),
      status: 'received',
      rawShopifyPayload: payload.rawShopifyPayload || null,
      transformedPayload: payload.transformedPayload || null,
      warehouseRequest: payload.warehouseRequest || null,
      warehouseResponse: payload.warehouseResponse || null,
      error: payload.error || null,
      createdAt: now,
      updatedAt: now,
    };
    logs.unshift(entry);
    await writeJsonFile(logs);
    return entry;
  }

  static async update(id, updates) {
    const logs = await readJsonFile();
    const index = logs.findIndex((log) => log.id === id);
    if (index === -1) return null;
    const updated = {
      ...logs[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    logs[index] = updated;
    await writeJsonFile(logs);
    return updated;
  }

  static async list(limit = 20) {
    const logs = await readJsonFile();
    return logs.slice(0, limit);
  }

  static async findById(id) {
    const logs = await readJsonFile();
    return logs.find((log) => log.id === id) || null;
  }

  static async deleteById(id) {
    const logs = await readJsonFile();
    const nextLogs = logs.filter((log) => log.id !== id);
    if (nextLogs.length === logs.length) return false;
    await writeJsonFile(nextLogs);
    return true;
  }

  static async findByWarehouseOrderId(warehouseOrderId) {
    const logs = await readJsonFile();
    return (
      logs.find((log) => String(log?.warehouseResponse?.id) === String(warehouseOrderId)) || null
    );
  }
}

module.exports = TransactionLog;
