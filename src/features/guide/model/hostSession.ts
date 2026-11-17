import { computed, ref } from "vue";
import {
  HEARTBEAT_MS,
  PUBLISH_INTERVAL_MS,
  RESYNC_MS,
  VIEWER_TIMEOUT_MS,
  makeEnvelope,
  type GuideEnvelope,
  type SceneState,
  type SyncMode,
} from "../model/protocol";
import type { GuideTransport } from "../lib/transport";
import { onScopeDisposeSafe } from "../lib/lifecycle";
import { makeEpoch, makeId } from "../lib/identity";

/**
 * 讲解员主控会话。
 *
 * 控制权归属：会话存续期间讲解员是唯一主线控制者，所有结构性操作
 * （切章、进访谈、收藏点回看）立即以 snapshot 整屏广播；播放态与镜头
 * 走高频节流通道。观众侧的操作不会回传，因此不存在两边同时抢控。
 *
 * seq 严格单调递增，新会话 / 重连生成新 epoch，从根上让旧命令失效。
 */
export interface HostSessionOptions {
  transport: GuideTransport;
  displayName: string;
  initialMode: SyncMode;
  getScene: () => SceneState;
}

export interface ViewerPresence {
  id: string;
  name: string;
  lastSeen: number;
}

export function createHostSession(options: HostSessionOptions) {
  const selfId = makeId("host");
  const epoch = makeEpoch();
  let seq = 0;
  const active = ref(false);
  const mode = ref<SyncMode>(options.initialMode);
  const viewers = ref<ViewerPresence[]>([]);

  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let sweepTimer: ReturnType<typeof setInterval> | undefined;
  let resyncTimer: ReturnType<typeof setInterval> | undefined;

  const nextSeq = () => ++seq;
  type HostOut = Omit<
    GuideEnvelope,
    "v" | "ts" | "epoch" | "seq" | "from" | "name" | "role"
  > &
    Partial<Pick<GuideEnvelope, "seq">>;
  const emit = (msg: HostOut) =>
    options.transport.send(
      makeEnvelope({
        ...msg,
        epoch,
        seq: msg.seq ?? nextSeq(),
        role: "host",
        from: selfId,
        name: options.displayName,
      }),
    );

  function touchViewer(msg: GuideEnvelope) {
    const list = viewers.value.filter((v) => v.id !== msg.from);
    list.push({ id: msg.from, name: msg.name, lastSeen: Date.now() });
    viewers.value = list;
  }

  function handleIncoming(msg: GuideEnvelope) {
    if (msg.role !== "viewer") return;
    if (msg.kind === "hello") {
      touchViewer(msg);
      // 新观众（或重连观众）立即拿到讲解员当前完整场景，且走新的序号
      publishSnapshot();
      return;
    }
    if (msg.kind === "heartbeat") touchViewer(msg);
    if (msg.kind === "bye")
      viewers.value = viewers.value.filter((v) => v.id !== msg.from);
  }

  options.transport.onMessage(handleIncoming);

  /** 结构性变化：整屏快照立即发送，保证两屏章节与热点同时收敛 */
  function publishSnapshot() {
    if (!active.value) return;
    emit({ kind: "snapshot", mode: mode.value, scene: options.getScene() });
  }

  /** 高频播放控制：leading + trailing 节流，拖动 / 暂停合并不丢最后一帧 */
  function publishTransport() {
    if (!active.value) return;
    throttled(
      () =>
        emit({
          kind: "transport",
          mode: mode.value,
          scene: options.getScene(),
        }),
      "transport",
    );
  }

  /** 镜头转动：仅 camera 模式有意义，position 模式下不产生流量 */
  function publishCamera() {
    if (!active.value || mode.value !== "camera") return;
    throttled(
      () =>
        emit({
          kind: "camera",
          mode: mode.value,
          scene: options.getScene(),
        }),
      "camera",
    );
  }

  const throttlers = new Map<
    string,
    { last: number; timer: ReturnType<typeof setTimeout> | null }
  >();
  function throttled(fn: () => void, key: "transport" | "camera") {
    const interval =
      key === "transport"
        ? PUBLISH_INTERVAL_MS.transport
        : PUBLISH_INTERVAL_MS.camera;
    const now = Date.now();
    let entry = throttlers.get(key);
    if (!entry) {
      entry = { last: 0, timer: null };
      throttlers.set(key, entry);
    }
    const wait = entry.last + interval - now;
    if (wait <= 0) {
      entry.last = now;
      fn();
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      return;
    }
    if (entry.timer) return;
    entry.timer = setTimeout(() => {
      entry!.last = Date.now();
      entry!.timer = null;
      fn();
    }, wait);
  }

  function start() {
    if (active.value) return;
    active.value = true;
    seq = 0;
    emit({ kind: "hello", mode: mode.value, scene: options.getScene() });
    heartbeatTimer = setInterval(() => {
      emit({ kind: "heartbeat", mode: mode.value });
    }, HEARTBEAT_MS);
    sweepTimer = setInterval(() => {
      const cutoff = Date.now() - VIEWER_TIMEOUT_MS;
      viewers.value = viewers.value.filter((v) => v.lastSeen >= cutoff);
    }, 1000);
    resyncTimer = setInterval(() => {
      // 播放中周期性再同步，限制两屏独立走时的漂移；暂停时无漂移可省
      if (options.getScene().playing)
        emit({
          kind: "resync",
          mode: mode.value,
          scene: options.getScene(),
        });
    }, RESYNC_MS);
  }

  function end(reason: "closed" | "stopped" = "stopped") {
    if (!active.value) return;
    active.value = false;
    emit({ kind: reason === "closed" ? "bye" : "end", mode: mode.value });
    clearInterval(heartbeatTimer);
    clearInterval(sweepTimer);
    clearInterval(resyncTimer);
    throttlers.forEach((t) => t.timer && clearTimeout(t.timer));
    throttlers.clear();
    viewers.value = [];
  }

  function setMode(next: SyncMode) {
    if (mode.value === next) return;
    mode.value = next;
    // 模式切换本身要让两屏立即对齐：切到 camera 时补一次整屏快照
    publishSnapshot();
  }

  const onPageHide = () => end("closed");
  if (typeof window !== "undefined")
    window.addEventListener("pagehide", onPageHide);

  const viewerCount = computed(() => viewers.value.length);

  function dispose() {
    end();
    if (typeof window !== "undefined")
      window.removeEventListener("pagehide", onPageHide);
  }
  onScopeDisposeSafe(dispose);

  return {
    selfId,
    epoch,
    active,
    mode,
    viewers,
    viewerCount,
    start,
    end,
    setMode,
    publishSnapshot,
    publishTransport,
    publishCamera,
    dispose,
  };
}

export type HostSession = ReturnType<typeof createHostSession>;
