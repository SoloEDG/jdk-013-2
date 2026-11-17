import type { GuideRole, SyncMode } from "../model/protocol";

/** 同一展厅内的固定频道：讲解员控制窗与观众屏据此找到彼此 */
export const GUIDE_CHANNEL = "shoreline-guide-v1";

const roleKey = "shoreline-guide-role";
const nameKey = "shoreline-guide-name";
const modeKey = "shoreline-guide-mode";

export function loadRole(): GuideRole | null {
  const value = localStorage.getItem(roleKey);
  return value === "host" || value === "viewer" ? value : null;
}

export function saveRole(role: GuideRole) {
  localStorage.setItem(roleKey, role);
}

export function clearRole() {
  localStorage.removeItem(roleKey);
}

export function loadDisplayName(role: GuideRole): string {
  return (
    localStorage.getItem(`${nameKey}-${role}`) ||
    (role === "host" ? "讲解员" : "观众屏")
  );
}

export function saveDisplayName(role: GuideRole, name: string) {
  localStorage.setItem(`${nameKey}-${role}`, name);
}

export function loadMode(): SyncMode {
  return localStorage.getItem(modeKey) === "position" ? "position" : "camera";
}

export function saveMode(mode: SyncMode) {
  localStorage.setItem(modeKey, mode);
}

export function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeEpoch() {
  return makeId("epoch");
}
