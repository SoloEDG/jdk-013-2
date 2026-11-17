import type { Camera, Position } from "../../../shared/types";

/**
 * 双屏导览协议（纯数据层，不依赖 Vue / DOM，便于单元测试）。
 *
 * 设计要点：
 * - 每条消息携带完整场景快照 SceneState，切章 / 进入访谈等结构性操作
 *   永远以「整屏状态」原子收敛，杜绝只同步一个时间数字、章节与热点不一致。
 * - epoch（会话号）+ seq（单调序号）构成防倒退闸门：重连后旧会话、
 *   重复投递的旧命令一律丢弃。
 * - 同步模式 position 只带动播放位置；camera 模式才带动视角。
 */

export type GuideRole = "host" | "viewer";
export type SyncMode = "position" | "camera";
export type MessageKind =
  | "hello"
  | "heartbeat"
  | "snapshot"
  | "transport"
  | "camera"
  | "end"
  | "bye"
  | "resync";

/** 讲解员屏幕上的完整场景，是两屏收敛的最小一致单元 */
export interface SceneState {
  chapterId: string;
  time: number;
  playing: boolean;
  camera: Camera;
  selectedHotspotId: string | null;
  branchPersonId: string | null;
  branchParagraph: number;
  branchReturnPoint: Position | null;
}

export interface GuideEnvelope {
  v: 1;
  kind: MessageKind;
  /** 每次讲解员开启会话生成新 epoch；epoch 变化意味着旧会话命令全部失效 */
  epoch: string;
  /** 同一 epoch 内严格单调递增，用于丢弃乱序 / 重复的旧命令 */
  seq: number;
  role: GuideRole;
  from: string;
  name: string;
  ts: number;
  /** 讲解员当前选择的同步范围 */
  mode?: SyncMode;
  scene?: SceneState;
}

export interface SeqCursor {
  epoch: string;
  seq: number;
}

/**
 * 防倒退判定：新 epoch（重连 / 新会话）一律放行并重置游标；
 * 同 epoch 内只接受序号更大的消息，旧命令直接丢弃。
 */
export function isStaleMessage(msg: GuideEnvelope, cursor: SeqCursor | null) {
  if (!cursor) return false;
  if (msg.epoch !== cursor.epoch) return false;
  return msg.seq <= cursor.seq;
}

/** 结构性消息：会改变章节 / 热点 / 访谈支线，必须整屏原子收敛 */
export function isStructural(kind: MessageKind) {
  return kind === "snapshot";
}

export interface ApplyPlan {
  chapter: boolean;
  time: boolean;
  playing: boolean;
  camera: boolean;
  hotspot: boolean;
  branch: boolean;
}

/**
 * 决定一条远端场景消息应当收敛哪些字段。
 *
 * - snapshot（切章、进访谈、回收藏点等结构性操作）：全部字段一起收敛，
 *   即便观众正在看支线，也以讲解员当前主线为准并退出支线。
 * - transport（播放 / 暂停 / 拖动）：只收敛位置与播放态，不打扰观众支线；
 *   视角仅在 camera 模式下收敛。
 * - camera（转动镜头）：仅 camera 模式生效，且绝不触碰章节 / 时间。
 */
export function planSceneApply(kind: MessageKind, mode: SyncMode): ApplyPlan {
  if (kind === "snapshot") {
    return {
      chapter: true,
      time: true,
      playing: true,
      camera: true,
      hotspot: true,
      branch: true,
    };
  }
  if (kind === "transport" || kind === "resync") {
    return {
      chapter: true,
      time: true,
      playing: true,
      camera: mode === "camera",
      hotspot: false,
      branch: false,
    };
  }
  if (kind === "camera") {
    return {
      chapter: false,
      time: false,
      playing: false,
      camera: mode === "camera",
      hotspot: false,
      branch: false,
    };
  }
  return {
    chapter: false,
    time: false,
    playing: false,
    camera: false,
    hotspot: false,
    branch: false,
  };
}

/** 完整主线收敛计划：观众结束个人支线、回到讲解员当前主线时使用 */
export const FULL_SCENE_PLAN: ApplyPlan = {
  chapter: true,
  time: true,
  playing: true,
  camera: true,
  hotspot: true,
  branch: true,
};

/**
 * 会话闸门：游标已建立后，只接受同 epoch 的消息；
 * 重连后讲解员会带来新 epoch，旧 epoch 的迟到命令在此被拒绝。
 */
export function acceptsEpoch(msg: GuideEnvelope, cursor: SeqCursor | null) {
  return !cursor || msg.epoch === cursor.epoch;
}

/** 节流参数：高频的拖动 / 转镜头合并发送，结构性变化立即发送 */
export const PUBLISH_INTERVAL_MS = { transport: 250, camera: 90 } as const;
export const HEARTBEAT_MS = 1500;
export const HOST_TIMEOUT_MS = 5000;
export const VIEWER_TIMEOUT_MS = 6000;
/** 播放中的周期性再同步：把两屏各自走时产生的漂移限制在两秒以内 */
export const RESYNC_MS = 2000;

export function makeEnvelope(
  partial: Omit<GuideEnvelope, "v" | "ts"> & { ts?: number },
): GuideEnvelope {
  return { v: 1, ts: Date.now(), ...partial };
}
