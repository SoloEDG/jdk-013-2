import { ref } from "vue";
import { createCamera } from "../features/panorama";
import { createPlayback } from "../features/chapters";
import { createDiscovery } from "../features/hotspots";
import { createBranch } from "../features/interviews";
import { createJournal } from "../features/journal";
import type { Command, Position } from "../shared/types";
import { deepClone } from "../shared/clone";
import type {
  GuideRole,
  SceneState,
  SyncMode,
} from "../features/guide/model/protocol";
import type { ApplyPlan } from "../features/guide/model/protocol";
import {
  createTransport,
  type GuideTransport,
} from "../features/guide/lib/transport";
import { GUIDE_CHANNEL, loadMode } from "../features/guide/lib/identity";
import {
  reconcileRemoteScene,
  type SceneSink,
} from "../features/guide/lib/reconcile";
import {
  createHostSession,
  type HostSession,
} from "../features/guide/model/hostSession";
import {
  createViewerSession,
  type ViewerSession,
} from "../features/guide/model/viewerSession";

export interface WorkspaceOptions {
  role: GuideRole;
  displayName: string;
  /** 测试可注入内存传输；生产默认走 BroadcastChannel */
  transport?: GuideTransport;
}

export function createWorkspace(options: WorkspaceOptions) {
  const role = options.role;
  const camera = createCamera(),
    playback = createPlayback(),
    discovery = createDiscovery(() => playback.state),
    branch = createBranch(),
    journal = createJournal(role),
    tab = ref("story");

  /**
   * 观众的个人支线标记：进入自己点开的访谈 / 热点后置位。
   * 期间讲解员的播放、镜头消息不打断；只有结构性 snapshot 能强制收敛。
   */
  let localOverride = false;

  const position = (): Position => ({
    chapterId: playback.state.chapterId,
    time: playback.state.time,
    camera: { ...camera.camera },
    playing: playback.state.playing,
  });

  const getScene = (): SceneState => ({
    chapterId: playback.state.chapterId,
    time: playback.state.time,
    playing: playback.state.playing,
    camera: { ...camera.camera },
    selectedHotspotId: discovery.selected.value,
    branchPersonId: branch.personId.value,
    branchParagraph: branch.paragraph.value,
    branchReturnPoint: branch.returnPoint.value
      ? deepClone(branch.returnPoint.value)
      : null,
  });

  /**
   * 整屏状态收敛的唯一入口。按 plan 决定字段，结构性切换时
   * 章节、时间、视角、热点选择、访谈支线在同一调用里一起完成，
   * 保证两屏最终章节与热点必然一致。
   */
  function applyScene(scene: SceneState, plan: ApplyPlan) {
    if (plan.branch) {
      if (scene.branchPersonId) {
        if (branch.personId.value !== scene.branchPersonId) {
          branch.enter(scene.branchPersonId, scene.branchReturnPoint ?? position());
        }
        branch.paragraph.value = scene.branchParagraph;
      } else if (branch.personId.value) {
        branch.leave();
      }
    }
    if (plan.chapter && playback.state.chapterId !== scene.chapterId) {
      playback.select(scene.chapterId);
      discovery.close();
    }
    if (plan.time) playback.seek(scene.time);
    if (plan.playing) playback.state.playing = scene.playing;
    if (plan.camera) camera.restore(scene.camera);
    if (plan.hotspot) {
      discovery.selected.value = scene.selectedHotspotId;
    }
  }

  const sceneSink: SceneSink = {
    getScene,
    applyScene,
    isLocalOverride: () => localOverride,
    clearLocalOverride: () => {
      localOverride = false;
    },
  };

  // ---- 导览会话装配 -------------------------------------------------------
  const transport: GuideTransport =
    options.transport ?? createTransport(GUIDE_CHANNEL);
  const host = role === "host"
    ? createHostSession({
        transport,
        displayName: options.displayName,
        initialMode: loadMode(),
        getScene,
      })
    : null;
  const viewer = role === "viewer"
    ? createViewerSession({
        transport,
        displayName: options.displayName,
        applyRemoteScene: (scene, kind, mode) =>
          reconcileRemoteScene(sceneSink, scene, kind, mode),
        onHostEnded: () => {
          localOverride = false;
        },
      })
    : null;
  const guideActive = ref(false);

  /** 观众跟随期间，主线播放控制归属讲解员，本地输入锁定 */
  const controlsLocked = () =>
    role === "viewer" &&
    guideActive.value &&
    viewer?.status.value === "following" &&
    !localOverride;

  // ---- 本地操作 -----------------------------------------------------------
  function enterPerson(id: string) {
    branch.enter(id, position());
    playback.state.playing = false;
    discovery.close();
    if (role === "viewer" && guideActive.value) localOverride = true;
    if (host?.active.value) host.publishSnapshot();
  }

  function openHotspot(id: string) {
    discovery.select(id);
    if (role === "viewer" && guideActive.value) localOverride = true;
    if (host?.active.value) host.publishSnapshot();
  }

  function closeHotspot() {
    discovery.close();
    if (role === "viewer" && guideActive.value && !branch.personId.value)
      localOverride = false;
    if (host?.active.value) host.publishSnapshot();
  }

  function dispatch(command: Command) {
    switch (command.type) {
      case "chapter":
        if (branch.personId.value) return;
        if (controlsLocked()) return; // 跟随期间观众不能自行切章
        playback.select(command.id);
        camera.reset();
        discovery.close();
        localOverride = false;
        host?.active.value && host.publishSnapshot();
        break;
      case "seek":
        if (controlsLocked()) return;
        playback.seek(command.time);
        host?.active.value && host.publishTransport();
        break;
      case "hotspot":
        openHotspot(command.id);
        break;
      case "return": {
        if (role === "viewer" && guideActive.value && localOverride) {
          // 结束任何个人支线（访谈 / 热点 / 手记回看）：回到讲解员「当前」
          // 主线，而非进入支线前保存的旧位置
          branch.leave();
          viewer?.returnToMainline(
            () => doLocalReturn(),
            () => localOverride,
          );
          localOverride = false;
          discovery.close();
          return;
        }
        doLocalReturn();
        host?.active.value && host.publishSnapshot();
        break;
      }
      case "revisit":
        if (controlsLocked()) return;
        branch.leave();
        playback.select(command.entry.chapterId);
        playback.seek(command.entry.time);
        camera.restore(command.entry.camera);
        discovery.select(command.entry.hotspotId);
        tab.value = "story";
        if (role === "viewer" && guideActive.value) localOverride = true;
        host?.active.value && host.publishSnapshot();
        break;
    }
  }

  function doLocalReturn() {
    const saved = branch.leave();
    if (saved) {
      playback.select(saved.chapterId);
      playback.seek(saved.time);
      camera.restore(saved.camera);
      playback.state.playing = saved.playing;
    }
  }

  /** 播放 / 暂停：跟随期间观众侧锁定，讲解员操作走 transport 通道 */
  function togglePlay() {
    if (controlsLocked()) return;
    playback.toggle();
    host?.active.value && host.publishTransport();
  }

  function seekLocal(time: number) {
    if (controlsLocked()) return;
    playback.seek(time);
    host?.active.value && host.publishTransport();
  }

  function moveCamera(dx: number, dy: number) {
    camera.move(dx, dy);
    host?.active.value && host.publishCamera();
  }

  function zoomCamera(delta: number) {
    camera.zoom(delta);
    host?.active.value && host.publishCamera();
  }

  function resetCamera() {
    camera.reset();
    host?.active.value && host.publishSnapshot();
  }

  function save() {
    const h = discovery.detail.value;
    // 收藏只写本屏自己的手记库，导览协议从不携带收藏数据，互不覆盖
    if (h) journal.save(h, position());
  }

  // ---- 会话开关 -----------------------------------------------------------
  function startGuiding() {
    if (!host) return;
    host.start();
    guideActive.value = true;
    host.publishSnapshot();
  }

  function stopGuiding() {
    host?.end("stopped");
    guideActive.value = false;
  }

  function joinGuide() {
    if (!viewer) return;
    viewer.join();
    guideActive.value = true;
  }

  function leaveGuide() {
    viewer?.leave();
    guideActive.value = false;
    localOverride = false;
  }

  function setSyncMode(next: SyncMode) {
    host?.setMode(next);
  }

  return {
    role,
    camera,
    playback,
    discovery,
    branch,
    journal,
    tab,
    // 导览会话（角色不匹配的一侧为 null）
    host,
    viewer,
    guideActive,
    /** 观众连接状态：idle / connecting / following / reconnecting / host-closed */
    get followStatus() {
      return viewer?.status.value ?? "idle";
    },
    /** 当前同步模式（讲解员可切换，观众只读展示） */
    get syncMode() {
      return (host?.mode.value ?? viewer?.mode.value ?? loadMode()) as SyncMode;
    },
    /** 界面提示「被谁接管」用的名称 */
    get hostName() {
      return viewer?.hostName.value ?? options.displayName;
    },
    get viewerCount() {
      return host?.viewerCount.value ?? 0;
    },
    /** 是否处于讲解员导览会话内（含观众临时查看支线期间），用于接管横幅 */
    get following() {
      return (
        role === "viewer" &&
        guideActive.value &&
        (viewer?.status.value === "following" ||
          viewer?.status.value === "reconnecting")
      );
    },
    /** 跟随期间观众主线输入是否被讲解员锁定（看支线时解锁本地浏览） */
    get locked() {
      return controlsLocked();
    },
    get inLocalOverride() {
      return localOverride;
    },
    startGuiding,
    stopGuiding,
    joinGuide,
    leaveGuide,
    setSyncMode,
    // 包装后的本地操作
    position,
    getScene,
    applyScene,
    enterPerson,
    openHotspot,
    closeHotspot,
    dispatch,
    togglePlay,
    seekLocal,
    moveCamera,
    zoomCamera,
    resetCamera,
    save,
  };
}

export type Workspace = ReturnType<typeof createWorkspace>;
