/**
 * 场景 / 位置快照的深拷贝。
 *
 * 这些数据只含可 JSON 序列化的普通值（数字、字符串、布尔、null、普通嵌套
 * 对象）。不能用 structuredClone：存入 Vue ref 后对象会被包成响应式 Proxy，
 * structuredClone 对 Proxy 会抛 DataCloneError。JSON 路线在浏览器与
 * Node 测试环境行为一致。
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
