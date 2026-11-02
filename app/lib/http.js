'use strict';

/**
 * Read a fetch response body while enforcing a byte cap. Unlike reading
 * `arrayBuffer()`/`text()` first, this stops as soon as the limit is crossed,
 * so a hostile or broken endpoint cannot allocate the whole body.
 */
async function readCapped(response, maxBytes, label = 'Response') {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared > maxBytes) {
    throw new Error(`${label} is too large`);
  }
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error(`${label} is too large`);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw new Error(`${label} is too large`);
      chunks.push(Buffer.from(value));
    }
  } catch (err) {
    try {
      await reader.cancel();
    } catch {
      /* already cancelled */
    }
    throw err;
  }
  return Buffer.concat(chunks);
}

module.exports = { readCapped };
