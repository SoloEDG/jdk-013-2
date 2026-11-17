import type { GuideEnvelope } from "../model/protocol";

/**
 * 展厅双屏同机通信：两块屏幕在同一浏览器下以 BroadcastChannel 直连，
 * 无需后端。传输层只负责消息投递，连接 / 存活判定全部由会话层
 * （hello / heartbeat / 超时）计算，职责单一、可替换。
 *
 * 展厅环境若改为跨设备，只需替换这一层（如 WebSocket），上层协议不变。
 */
export interface GuideTransport {
  send: (msg: GuideEnvelope) => void;
  onMessage: (handler: (msg: GuideEnvelope) => void) => void;
  close: () => void;
}

export function createTransport(channelName: string): GuideTransport {
  const handlers = new Set<(msg: GuideEnvelope) => void>();
  const channel: BroadcastChannel | null =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(channelName)
      : null;

  if (channel) {
    channel.onmessage = (event: MessageEvent<GuideEnvelope>) => {
      const msg = event.data;
      if (!msg || msg.v !== 1) return;
      handlers.forEach((h) => h(msg));
    };
  }

  return {
    send(msg) {
      try {
        channel?.postMessage(msg);
      } catch {
        /* 通道关闭等异常由会话层的心跳超时感知 */
      }
    },
    onMessage(handler) {
      handlers.add(handler);
    },
    close() {
      channel?.close();
      handlers.clear();
    },
  };
}
