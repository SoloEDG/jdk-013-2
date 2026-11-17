import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isStaleMessage,
  acceptsEpoch,
  planSceneApply,
  makeEnvelope,
  type GuideEnvelope,
  type SeqCursor,
} from "../model/protocol";

function msg(over: Partial<GuideEnvelope>): GuideEnvelope {
  return makeEnvelope({
    kind: "transport",
    epoch: "e1",
    seq: 1,
    role: "host",
    from: "h",
    name: "host",
    ...over,
  });
}

test("同 epoch 内序号不大于游标的命令被判为陈旧并丢弃", () => {
  const cursor: SeqCursor = { epoch: "e1", seq: 5 };
  assert.equal(isStaleMessage(msg({ seq: 5 }), cursor), true);
  assert.equal(isStaleMessage(msg({ seq: 3 }), cursor), true);
  assert.equal(isStaleMessage(msg({ seq: 6 }), cursor), false);
});

test("新 epoch（重连）的消息一律放行，旧 epoch 迟到命令被闸门拒绝", () => {
  const cursor: SeqCursor = { epoch: "e1", seq: 99 };
  // 游标建立后，旧会话 e0 的迟到消息被拒绝
  assert.equal(acceptsEpoch(msg({ epoch: "e0" }), cursor), false);
  // 同会话放行
  assert.equal(acceptsEpoch(msg({ epoch: "e1", seq: 100 }), cursor), true);
  // 尚未建立游标时不拦截
  assert.equal(acceptsEpoch(msg({ epoch: "anything" }), null), true);
});

test("snapshot 永远整屏收敛，保证章节与热点同时一致", () => {
  const plan = planSceneApply("snapshot", "position");
  assert.deepEqual(plan, {
    chapter: true,
    time: true,
    playing: true,
    camera: true,
    hotspot: true,
    branch: true,
  });
});

test("position 模式下 transport 不带动视角，camera 模式才带动", () => {
  const positionOnly = planSceneApply("transport", "position");
  assert.equal(positionOnly.chapter, true);
  assert.equal(positionOnly.time, true);
  assert.equal(positionOnly.playing, true);
  assert.equal(positionOnly.camera, false);
  assert.equal(positionOnly.hotspot, false);

  const withCamera = planSceneApply("transport", "camera");
  assert.equal(withCamera.camera, true);
});

test("camera 消息只动镜头，绝不触碰章节与时间", () => {
  const plan = planSceneApply("camera", "camera");
  assert.equal(plan.camera, true);
  assert.equal(plan.chapter, false);
  assert.equal(plan.time, false);
  assert.equal(plan.playing, false);
  assert.equal(plan.hotspot, false);
  assert.equal(plan.branch, false);
  // position 模式下镜头消息完全不生效
  assert.equal(planSceneApply("camera", "position").camera, false);
});

test("resync 与 transport 收敛范围一致，用于限制走时漂移", () => {
  assert.deepEqual(
    planSceneApply("resync", "position"),
    planSceneApply("transport", "position"),
  );
});
