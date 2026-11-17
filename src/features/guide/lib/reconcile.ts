import type { SceneState, SyncMode, MessageKind } from "../model/protocol";
import { FULL_SCENE_PLAN, planSceneApply, type ApplyPlan } from "../model/protocol";

/**
 * 工作区需要向导览层暴露的收敛接口。
 * 只暴露「整屏状态」的读写，不允许导览层零散改单个字段，
 * 从接口层面保证章节、时间、热点、支线永远作为一个整体切换。
 */
export interface SceneSink {
  getScene: () => SceneState;
  applyScene: (scene: SceneState, plan: ApplyPlan) => void;
  isLocalOverride: () => boolean;
  clearLocalOverride: () => void;
}

/**
 * 把讲解员消息收敛到本地工作区。
 *
 * 关键约束：
 * - snapshot 与「回到主线」走完整计划，切章时连同热点选择、访谈支线
 *   一起切换，杜绝两屏章节一致但热点 / 支线还停留在旧状态。
 * - transport / camera 按模式与计划部分收敛，绝不触碰未授权字段。
 * - 观众本地支线期间，普通 transport/camera 被忽略（由 isLocalOverride
 *   判断），只有结构性 snapshot 能强制收敛并清掉支线。
 */
export function reconcileRemoteScene(
  sink: SceneSink,
  scene: SceneState,
  kind: MessageKind,
  mode: SyncMode,
) {
  if (kind === "snapshot") {
    sink.clearLocalOverride();
    sink.applyScene(scene, FULL_SCENE_PLAN);
    return;
  }
  if (sink.isLocalOverride()) return; // 看支线期间不被播放 / 镜头消息打断
  const plan = planSceneApply(kind, mode);
  if (!Object.values(plan).some(Boolean)) return; // 如 position 模式的镜头消息
  sink.applyScene(scene, plan);
}

/** 观众主动结束支线：完整回到讲解员当前主线快照 */
export function reconcileMainlineReturn(sink: SceneSink, scene: SceneState) {
  sink.clearLocalOverride();
  sink.applyScene(scene, FULL_SCENE_PLAN);
}
