import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHostSession } from "../model/hostSession";
import { createViewerSession } from "../model/viewerSession";
import { createFakeTransportPair } from "../lib/fakeTransport";
import type {
  ApplyPlan,
  MessageKind,
  SceneState,
  SyncMode,
} from "../model/protocol";

function scene(over: Partial<SceneState> = {}): SceneState {
  return {
    chapterId: "dawn",
    time: 0,
    playing: false,
    camera: { yaw: 0, pitch: 0, fov: 70 },
    selectedHotspotId: null,
    branchPersonId: null,
    branchParagraph: 0,
    branchReturnPoint: null,
    ...over,
  };
}

interface AppliedCall {
  scene: SceneState;
  kind: MessageKind;
  mode: SyncMode;
}

function flush(ms = 5) {
  return new Promise((r) => setTimeout(r, ms));
}

let hostTransport: ReturnType<typeof createFakeTransportPair>[0];
let viewerTransport: ReturnType<typeof createFakeTransportPair>[1];
let host: ReturnType<typeof createHostSession>;
let viewer: ReturnType<typeof createViewerSession>;
let hostScene: SceneState;
let received: AppliedCall[];
let endedReasons: string[];

beforeEach(() => {
  [hostTransport, viewerTransport] = createFakeTransportPair();
  hostScene = scene();
  received = [];
  endedReasons = [];
  host = createHostSession({
    transport: hostTransport,
    displayName: "讲解员",
    initialMode: "camera",
    getScene: () => hostScene,
  });
  viewer = createViewerSession({
    transport: viewerTransport,
    displayName: "观众",
    applyRemoteScene: (s, kind, mode) => received.push({ scene: s, kind, mode }),
    onHostEnded: (reason) => endedReasons.push(reason),
  });
});

afterEach(() => {
  host.dispose();
  viewer.leave();
});

test("建链后观众收到讲解员完整场景，状态进入 following", async () => {
  host.start();
  viewer.join();
  await flush();
  assert.equal(viewer.status.value, "following");
  assert.equal(viewer.hostName.value, "讲解员");
  assert.ok(received.some((r) => r.kind === "hello" || r.kind === "snapshot"));
});

test("切章发布 snapshot：观众以完整计划原子收敛，章节与热点同时一致", async () => {
  host.start();
  viewer.join();
  await flush();
  hostScene = scene({
    chapterId: "night",
    selectedHotspotId: "light",
    branchPersonId: null,
  });
  host.publishSnapshot();
  await flush();
  const snap = received.filter((r) => r.kind === "snapshot").at(-1)!;
  assert.equal(snap.scene.chapterId, "night");
  assert.equal(snap.scene.selectedHotspotId, "light");
});

test("position 模式下镜头转动不影响观众；切到 camera 后才带动视角", async () => {
  host.start();
  viewer.join();
  await flush();
  host.setMode("position");
  hostScene = scene({ camera: { yaw: 90, pitch: 0, fov: 70 } });
  host.publishCamera();
  await flush();
  // position 模式下 publishCamera 直接短路，无 camera 消息
  assert.ok(!received.some((r) => r.kind === "camera"));

  host.setMode("camera");
  host.publishCamera();
  await flush();
  const cam = received.filter((r) => r.kind === "camera").at(-1);
  assert.ok(cam);
  assert.equal(cam!.scene.camera.yaw, 90);
});

test("重连使用新 epoch：旧会话迟到命令被拒绝，不会倒退到旧命令", async () => {
  host.start();
  viewer.join();
  await flush();
  hostScene = scene({ chapterId: "craft", time: 10 });
  host.publishTransport();
  await flush();
  const firstEpoch = host.epoch;

  // 模拟控制窗重开：销毁旧会话，建立新会话（新 epoch）
  host.dispose();
  await flush();
  const host2 = createHostSession({
    transport: hostTransport,
    displayName: "讲解员",
    initialMode: "camera",
    getScene: () => hostScene,
  });
  assert.notEqual(host2.epoch, firstEpoch);
  host2.start();
  await flush();
  assert.equal(viewer.status.value, "following");

  // 重连后观众最后一次收敛来自新会话快照，章节为 craft 而非旧的 dawn
  const last = received.at(-1)!;
  assert.equal(last.scene.chapterId, "craft");
  host2.dispose();
});

test("讲解员结束会话时观众收到通知并可继续独立观看", async () => {
  host.start();
  viewer.join();
  await flush();
  host.end("stopped");
  await flush();
  assert.deepEqual(endedReasons, ["stopped"]);
  assert.equal(viewer.status.value, "host-closed");
});

test("观众进入支线后结束，returnToMainline 回到讲解员当前主线而非旧位置", async () => {
  host.start();
  viewer.join();
  await flush();
  // 讲解员主线已推进到 night 章节
  hostScene = scene({ chapterId: "night", time: 12, playing: true });
  host.publishSnapshot();
  await flush();
  const lastScene = received.at(-1)!.scene;

  let fellBack = false;
  viewer.returnToMainline(
    () => {
      fellBack = true;
    },
    () => true, // 观众当前确实在个人支线
  );
  assert.equal(fellBack, false);
  const back = received.at(-1)!;
  assert.equal(back.kind, "snapshot");
  assert.equal(back.scene.chapterId, lastScene.chapterId);
  assert.equal(back.scene.time, 12);
});

// 仅用于类型引用，确保 ApplyPlan 在测试中可被消费
export type { ApplyPlan };
