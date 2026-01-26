function safeGet(obj, path, fallback = undefined) {
  if (!obj) return fallback;
  const parts = Array.isArray(path) ? path : String(path).split('.');
  let current = obj;
  for (const part of parts) {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return fallback;
    }
  }
  return current ?? fallback;
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  safeGet,
  safeJsonParse,
};
