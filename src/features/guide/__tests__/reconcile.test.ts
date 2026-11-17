import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileRemoteScene, reconcileMainlineReturn } from "../lib/reconcile";
import type { SceneSink } from "../lib/reconcile";
import type { ApplyPlan, SceneState } from "../model/protocol";

function makeScene(over: Partial<SceneState> = {}): SceneState {
  return {
    chapterId: "craft",
    time: 8,
    playing: true,
    camera: { yaw: 30, pitch: -5, fov: 70 },
    selectedHotspotId: "tools",
    branchPersonId: null,
    branchParagraph: 0,
    branchReturnPoint: null,
    ...over,
  };
}

function makeSink(initialOverride = false) {
  const applied: { scene: SceneState; plan: ApplyPlan }[] = [];
  let override = initialOverride;
  const sink: SceneSink = {
    getScene: () => makeScene(),
    applyScene: (scene, plan) => applied.push({ scene, plan }),
    isLocalOverride: () => override,
    clearLocalOverride: () => {
      override = false;
    },
  };
  return {
    sink,
    applied,
    isCleared: () => override === false,
    setOverride: (v: boolean) => {
      override = v;
    },
  };
}

test("观众看个人支线时，普通 transport 被忽略，不打断支线", () => {
  const { sink, applied } = makeSink(true);
  reconcileRemoteScene(sink, makeScene(), "transport", "camera");
  assert.equal(applied.length, 0);
});

test("支线期间收到结构性 snapshot 仍强制整屏收敛并清除支线", () => {
  const { sink, applied, isCleared } = makeSink(true);
  const scene = makeScene({ chapterId: "night", selectedHotspotId: "light" });
  reconcileRemoteScene(sink, scene, "snapshot", "position");
  assert.equal(isCleared(), true);
  assert.equal(applied.length, 1);
  assert.equal(applied[0]!.plan.chapter, true);
  assert.equal(applied[0]!.plan.hotspot, true);
  assert.equal(applied[0]!.plan.branch, true);
  assert.equal(applied[0]!.scene.chapterId, "night");
  assert.equal(applied[0]!.scene.selectedHotspotId, "light");
});

test("position 模式下镜头消息不产生任何收敛", () => {
  const { sink, applied } = makeSink(false);
  reconcileRemoteScene(sink, makeScene(), "camera", "position");
  assert.equal(applied.length, 0);
});

test("回到主线使用完整计划，章节/热点/支线一次性对齐", () => {
  const { sink, applied, isCleared } = makeSink(true);
  reconcileMainlineReturn(sink, makeScene({ branchPersonId: null }));
  assert.equal(isCleared(), true);
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0]!.plan, {
    chapter: true,
    time: true,
    playing: true,
    camera: true,
    hotspot: true,
    branch: true,
  });
});
