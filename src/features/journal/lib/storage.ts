import type { Entry } from "../../../shared/types";
import type { GuideRole } from "../../guide/model/protocol";

/**
 * 手记按屏幕角色分库存储：讲解员与观众各自拥有独立的 localStorage
 * 命名空间，导览同步只流转播放场景，从不到访手记存储，
 * 因此讲解员的任何操作都不可能覆盖观众收藏。
 */
const storageKey = (role: GuideRole | null) =>
  role === "host"
    ? "tidal-journal-v1-host"
    : role === "viewer"
      ? "tidal-journal-v1-viewer"
      : "tidal-journal-v1";

export function loadEntries(role: GuideRole | null = null): Entry[] {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(storageKey(role)) || "[]",
    );
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is Entry =>
        !!e &&
        typeof e.id === "string" &&
        typeof e.hotspotId === "string" &&
        typeof e.chapterId === "string" &&
        Number.isFinite(e.time) &&
        typeof e.title === "string" &&
        typeof e.note === "string" &&
        e.camera &&
        Number.isFinite(e.camera.yaw) &&
        Number.isFinite(e.camera.pitch) &&
        Number.isFinite(e.camera.fov) &&
        Number.isFinite(e.createdAt),
    );
  } catch {
    return [];
  }
}

export function persist(entries: Entry[], role: GuideRole | null = null) {
  try {
    localStorage.setItem(storageKey(role), JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}
