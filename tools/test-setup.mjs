// Node 单测环境垫片：浏览器全局在测试中用最小内存实现替代。
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}
globalThis.localStorage = new MemoryStorage();
if (typeof globalThis.window === "undefined") {
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
}
