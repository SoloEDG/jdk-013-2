import { ref } from "vue";
import {
  HEARTBEAT_MS,
  HOST_TIMEOUT_MS,
  acceptsEpoch,
  isStaleMessage,
  makeEnvelope,
  planSceneApply,
  type GuideEnvelope,
  type MessageKind,
  type SceneState,
  type SeqCursor,
  type SyncMode,
} from "../model/protocol";
import type { GuideTransport } from "../lib/transport";
import { onScopeDisposeSafe } from "../lib/lifecycle";
import { makeId } from "../lib/identity";

export type FollowStatus =
  | "idle"
  | "connecting"
  | "following"
  | "reconnecting"
  | "host-closed";

export interface ViewerSessionOptions {
  transport: GuideTransport;
  displayName: string;
  /** 应用讲解员场景；plan 为 null 表示放弃本地支线、完整回到主线 */
  applyRemoteScene: (
    scene: SceneState,
    kind: MessageKind,
    mode: SyncMode,
  ) => void;
  /** 讲解员结束会话（主动关闭 / 控制窗关闭 / 失联超时）时回调 */
  onHostEnded: (reason: "stopped" | "closed" | "timeout") => void;
}

/**
 * 观众跟随会话。
 *
 * 防倒退：cursor 记录 (epoch, seq)。重连后讲解员以新 epoch 重新 hello，
 * 旧 epoch 的迟到命令被 acceptsEpoch 拒绝；同一 epoch 内 seq 不大于游标的
 * 重复 / 乱序命令被 isStaleMessage 拒绝。因此重连绝不会倒退到旧命令。
 */
export function createViewerSession(options: ViewerSessionOptions) {
  const selfId = makeId("viewer");
  const status = ref<FollowStatus>("idle");
  const hostName = ref("");
  const mode = ref<SyncMode>("camera");
  const lastScene = ref<SceneState | null>(null);
  const lastKind = ref<MessageKind | null>(null);

  let cursor: SeqCursor | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let joined = false;

  function sendHello() {
    options.transport.send(
      makeEnvelope({
        kind: "hello",
        epoch: "pending",
        seq: 0,
        role: "viewer",
        from: selfId,
        name: options.displayName,
      }),
    );
  }

  function armTimeout() {
    clearTimeout(timeoutTimer);
    timeoutTimer = setTimeout(() => handleHostEnded("timeout"), HOST_TIMEOUT_MS);
  }

  function handleHostEnded(reason: "stopped" | "closed" | "timeout") {
    if (status.value !== "following" && status.value !== "reconnecting")
      return;
    stopTimers();
    cursor = null;
    lastScene.value = null;
    lastKind.value = null;
    status.value = "host-closed";
    options.onHostEnded(reason);
  }

  function stopTimers() {
    clearInterval(heartbeatTimer);
    clearTimeout(timeoutTimer);
  }

  function handleIncoming(msg: GuideEnvelope) {
    if (msg.role !== "host") return;

    if (msg.kind === "hello") {
      // 新会话或重连：讲解员带着新 epoch 出现，旧游标整体作废
      const isReconnect = joined && cursor?.epoch !== msg.epoch;
      cursor = { epoch: msg.epoch, seq: 0 };
      joined = true;
      hostName.value = msg.name;
      if (msg.mode) mode.value = msg.mode;
      status.value = isReconnect ? "reconnecting" : "following";
      armTimeout();
      if (msg.scene) consumeScene(msg);
      if (status.value === "reconnecting") status.value = "following";
      return;
    }

    if (!joined || !cursor) return;
    if (!acceptsEpoch(msg, cursor)) return; // 旧会话的迟到命令
    if (isStaleMessage(msg, cursor)) return; // 同会话的重复 / 乱序旧命令
    cursor.seq = msg.seq;
    armTimeout();

    if (msg.kind === "heartbeat") {
      if (msg.mode) mode.value = msg.mode;
      return;
    }
    if (msg.kind === "end") return handleHostEnded("stopped");
    if (msg.kind === "bye") return handleHostEnded("closed");

    if (msg.mode) mode.value = msg.mode;
    if (msg.scene) consumeScene(msg);
  }

  function consumeScene(msg: GuideEnvelope) {
    if (!msg.scene) return;
    lastScene.value = msg.scene;
    lastKind.value = msg.kind;
    options.applyRemoteScene(msg.scene, msg.kind, mode.value);
  }

  options.transport.onMessage(handleIncoming);

  function join() {
    // 重入（如断线后重新加入）先清理上一轮的心跳 / 超时表，避免重复定时器
    stopTimers();
    joined = false;
    cursor = null;
    lastScene.value = null;
    lastKind.value = null;
    status.value = "connecting";
    sendHello();
    heartbeatTimer = setInterval(sendHello, HEARTBEAT_MS);
    armTimeout();
  }

  /** 观众结束支线后调用：优先完整回到讲解员当前主线 */
  function returnToMainline(
    fallback: () => void,
    isLocalOverride: () => boolean,
  ) {
    if (
      status.value === "following" &&
      lastScene.value &&
      lastKind.value &&
      isLocalOverride()
    ) {
      options.applyRemoteScene(
        lastScene.value,
        "snapshot",
        mode.value,
      );
      return;
    }
    fallback();
  }

  function leave() {
    stopTimers();
    if (joined) {
      options.transport.send(
        makeEnvelope({
          kind: "bye",
          epoch: cursor?.epoch ?? "pending",
          seq: cursor?.seq ?? 0,
          role: "viewer",
          from: selfId,
          name: options.displayName,
        }),
      );
    }
    joined = false;
    cursor = null;
    lastScene.value = null;
    status.value = "idle";
  }

  onScopeDisposeSafe(leave);

  return {
    selfId,
    status,
    hostName,
    mode,
    join,
    leave,
    returnToMainline,
  };
}

export type ViewerSession = ReturnType<typeof createViewerSession>;
