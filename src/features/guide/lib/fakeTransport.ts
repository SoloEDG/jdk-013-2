import type { GuideEnvelope } from "../model/protocol";
import type { GuideTransport } from "./transport";

/**
 * 内存假传输：两个实例直连，用于在 Node 单测中模拟讲解员 / 观众链路，
 * 不依赖 BroadcastChannel 与 DOM。
 */
export function createFakeTransportPair(): [GuideTransport, GuideTransport] {
  const aHandlers = new Set<(msg: GuideEnvelope) => void>();
  const bHandlers = new Set<(msg: GuideEnvelope) => void>();

  const a: GuideTransport = {
    send: (msg) => queueMicrotask(() => bHandlers.forEach((h) => h(msg))),
    onMessage: (h) => aHandlers.add(h),
    close: () => aHandlers.clear(),
  };
  const b: GuideTransport = {
    send: (msg) => queueMicrotask(() => aHandlers.forEach((h) => h(msg))),
    onMessage: (h) => bHandlers.add(h),
    close: () => bHandlers.clear(),
  };
  // a 发出的消息应被 b 收到：b 的 send 投给 a 的 handler，
  // a 的 send 投给 b 的 handler，方向正确。
  return [a, b];
}

export function createLoopTransport(): GuideTransport & {
  delivered: GuideEnvelope[];
} {
  const delivered: GuideEnvelope[] = [];
  const handlers = new Set<(msg: GuideEnvelope) => void>();
  return {
    delivered,
    send: (msg) => {
      delivered.push(msg);
      queueMicrotask(() => handlers.forEach((h) => h(msg)));
    },
    onMessage: (h) => handlers.add(h),
    close: () => handlers.clear(),
  };
}
