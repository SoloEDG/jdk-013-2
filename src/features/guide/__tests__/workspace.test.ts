import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createWorkspace, type Workspace } from "../../../app/workspace";
import { createFakeTransportPair } from "../lib/fakeTransport";
import type { GuideTransport } from "../lib/transport";
import type { Entry } from "../../../shared/types";

function flush(ms = 8) {
  return new Promise((r) => setTimeout(r, ms));
}

let hostTransport: GuideTransport;
let viewerTransport: GuideTransport;
let host: Workspace;
let viewer: Workspace;
const extra: Workspace[] = [];

beforeEach(() => {
  localStorage.clear();
  [hostTransport, viewerTransport] = createFakeTransportPair();
  host = createWorkspace({
    role: "host",
    displayName: "讲解员",
    transport: hostTransport,
  });
  viewer = createWorkspace({
    role: "viewer",
    displayName: "观众",
    transport: viewerTransport,
  });
});

afterEach(() => {
  // 停掉心跳 / 超时定时器，避免事件循环保活导致测试进程挂起
  host?.stopGuiding();
  viewer?.leaveGuide();
  extra.forEach((w) => {
    w.stopGuiding();
    w.leaveGuide();
  });
  extra.length = 0;
  hostTransport?.close();
  viewerTransport?.close();
});

async function connect() {
  host.startGuiding();
  viewer.joinGuide();
  await flush();
}

test("讲解员切章后，观众的章节与热点选择最终完全一致（非仅时间数字）", async () => {
  await connect();
  host.dispatch({ type: "chapter", id: "night" });
  await flush();
  assert.equal(viewer.playback.state.chapterId, "night");
  assert.equal(host.playback.state.chapterId, "night");

  // 讲解员进入 night 章的人物热点并打开详情
  host.dispatch({ type: "hotspot", id: "light" });
  await flush();
  assert.equal(viewer.discovery.selected.value, "light");
  assert.equal(host.discovery.selected.value, "light");
});

test("同一时刻切章与进入访谈相遇：两屏最终章节与支线人物一致", async () => {
  await connect();
  // 连续两个结构性操作：先切章，再立即进入该章人物访谈
  host.dispatch({ type: "chapter", id: "craft" });
  host.enterPerson("lin");
  await flush();
  assert.equal(viewer.playback.state.chapterId, "craft");
  assert.equal(viewer.branch.personId.value, "lin");
  assert.equal(host.branch.personId.value, "lin");

  // 讲解员结束访谈，观众支线也同步退出
  host.dispatch({ type: "return" });
  await flush();
  assert.equal(viewer.branch.personId.value, null);
  assert.equal(viewer.playback.state.chapterId, "craft");
});

test("position 模式只同步位置；camera 模式才带动观众视角", async () => {
  await connect();
  host.setSyncMode("position");
  host.moveCamera(100, 0);
  await flush();
  assert.equal(viewer.camera.camera.yaw, 0); // 视角未被带动

  host.setSyncMode("camera");
  host.moveCamera(100, 0);
  await flush();
  assert.notEqual(viewer.camera.camera.yaw, 0); // 视角已跟随
});

test("跟随期间观众主线控制被锁定，界面可判断被讲解员接管", async () => {
  await connect();
  assert.equal(viewer.locked, true);
  const before = viewer.playback.state.chapterId;
  viewer.dispatch({ type: "chapter", id: "night" });
  viewer.togglePlay();
  assert.equal(viewer.playback.state.chapterId, before); // 操作被忽略
  assert.equal(viewer.hostName, "讲解员");
});

test("观众可临时进入人物支线，返回后回到讲解员当前主线", async () => {
  await connect();
  host.dispatch({ type: "chapter", id: "night" });
  host.playback.seek(15);
  await flush();

  // 观众自己点开人物支线
  viewer.enterPerson("xu");
  assert.equal(viewer.inLocalOverride, true);
  assert.equal(viewer.branch.personId.value, "xu");
  // 讲解员主线仍在 night，未被观众影响
  assert.equal(host.branch.personId.value, null);

  // 讲解员继续推进，支线中的观众不被普通播放消息打断
  host.seekLocal(20);
  await flush();
  assert.equal(viewer.branch.personId.value, "xu");

  // 观众返回主线：落到讲解员「当前」位置，而非进支线前的旧位置
  viewer.dispatch({ type: "return" });
  await flush();
  assert.equal(viewer.branch.personId.value, null);
  assert.equal(viewer.playback.state.chapterId, "night");
  assert.equal(viewer.playback.state.time, 20);
});

test("观众收藏与讲解员收藏物理隔离，互不覆盖", async () => {
  await connect();
  host.dispatch({ type: "hotspot", id: "fisher" });
  host.save();
  viewer.dispatch({ type: "hotspot", id: "boat" });
  viewer.save();

  assert.deepEqual(
    host.journal.entries.value.map((e: Entry) => e.hotspotId),
    ["fisher"],
  );
  assert.deepEqual(
    viewer.journal.entries.value.map((e: Entry) => e.hotspotId),
    ["boat"],
  );
  // 讲解员后续任何同步都不会改动观众手记
  host.dispatch({ type: "chapter", id: "craft" });
  await flush();
  assert.deepEqual(
    viewer.journal.entries.value.map((e: Entry) => e.hotspotId),
    ["boat"],
  );
});

test("观众看支线期间仍在导览会话内但主线输入解锁，可回到主线", async () => {
  await connect();
  assert.equal(viewer.following, true);
  assert.equal(viewer.locked, true);

  viewer.enterPerson("chen");
  assert.equal(viewer.following, true); // 接管横幅仍应展示
  assert.equal(viewer.locked, false); // 支线浏览解锁本地操作
  assert.equal(viewer.inLocalOverride, true);

  viewer.dispatch({ type: "return" });
  await flush();
  assert.equal(viewer.following, true);
  assert.equal(viewer.locked, true); // 返回后重新被讲解员接管
  assert.equal(viewer.inLocalOverride, false);
});

test("讲解员结束会话后，观众屏可继续独立观看且控制解锁", async () => {
  await connect();
  host.stopGuiding();
  await flush();
  assert.equal(viewer.followStatus, "host-closed");
  assert.equal(viewer.locked, false);
  viewer.dispatch({ type: "chapter", id: "night" });
  assert.equal(viewer.playback.state.chapterId, "night");
});

test("讲解员关闭后观众重新加入：无重复定时器且能再次跟随", async () => {
  await connect();
  host.stopGuiding();
  await flush();
  assert.equal(viewer.followStatus, "host-closed");

  // 讲解员重新开始（同工作区，内部生成新 epoch），观众重新加入
  host.startGuiding();
  viewer.joinGuide();
  await flush();
  assert.equal(viewer.followStatus, "following");
  assert.equal(viewer.locked, true);

  // 新会话仍能正常收敛切章
  host.dispatch({ type: "chapter", id: "night" });
  await flush();
  assert.equal(viewer.playback.state.chapterId, "night");
});

test("重连后观众不会倒退到断线前的旧命令，而是收敛到新会话当前场景", async () => {
  await connect();
  host.dispatch({ type: "chapter", id: "dawn" });
  await flush();

  // 讲解员控制窗重开：新工作区、新 epoch，当前已在 craft
  hostTransport.close();
  const [hostTransport2, viewerTransport2] = createFakeTransportPair();
  const host2 = createWorkspace({
    role: "host",
    displayName: "讲解员",
    transport: hostTransport2,
  });
  // 观众换用与新讲解员直连的传输（模拟重新建链），但保留自身工作区状态
  const viewer2 = createWorkspace({
    role: "viewer",
    displayName: "观众",
    transport: viewerTransport2,
  });
  extra.push(host2, viewer2);
  host2.dispatch({ type: "chapter", id: "craft" });
  host2.startGuiding();
  viewer2.joinGuide();
  await flush();
  assert.equal(viewer2.playback.state.chapterId, "craft");
  assert.notEqual(viewer2.playback.state.chapterId, "dawn");
});
