import { getCurrentInstance, onUnmounted } from "vue";

/**
 * 仅在存在活动组件实例时注册卸载回调。
 * 会话工厂同时被组件与 Node 单测复用，单测无组件实例，
 * 直接调 onUnmounted 会产生 Vue 告警，因此做实例守卫。
 */
export function onScopeDisposeSafe(fn: () => void) {
  if (getCurrentInstance()) onUnmounted(fn);
}
