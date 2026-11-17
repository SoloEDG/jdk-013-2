<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import type { CameraController } from "../model/camera";
import { createRenderer } from "../lib/renderer";
import Compass from "./Compass.vue";
const props = defineProps<{
  controller: CameraController;
  source: string;
  /** 导览跟随且处于视角同步时，观众不能自行拖动镜头 */
  locked?: boolean;
}>();
const emit = defineEmits<{
  move: [payload: { dx: number; dy: number }];
  zoom: [delta: number];
}>();
const host = ref<HTMLElement>();
const error = ref(false);
let render: ReturnType<typeof createRenderer> | undefined;
let observer: ResizeObserver | undefined;
let drag: { x: number; y: number } | undefined;
function down(e: PointerEvent) {
  if (props.locked) return;
  if ((e.target as HTMLElement).closest("button")) return;
  drag = { x: e.clientX, y: e.clientY };
  host.value?.setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (!drag || props.locked) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  emit("move", { dx, dy });
  drag = { x: e.clientX, y: e.clientY };
}
function wheel(e: WheelEvent) {
  if (props.locked) return;
  emit("zoom", e.deltaY);
}
onMounted(() => {
  try {
    render = createRenderer(host.value!, () => (error.value = true));
    render.load(props.source);
    render.draw(props.controller.camera);
    observer = new ResizeObserver(() => render?.draw(props.controller.camera));
    observer.observe(host.value!);
  } catch {
    error.value = true;
  }
});
watch(
  () => props.source,
  (url) => {
    error.value = false;
    render?.load(url);
  },
);
watch(
  () => ({ ...props.controller.camera }),
  () => render?.draw(props.controller.camera),
);
onUnmounted(() => {
  observer?.disconnect();
  render?.dispose();
});
</script>
<template>
  <div
    ref="host"
    class="panorama"
    :class="{ locked }"
    :style="{ backgroundImage: `url(${source})` }"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="drag = undefined"
    @pointercancel="drag = undefined"
    @wheel.prevent="wheel($event)"
  >
    <div v-if="error" class="media-warning">
      全景渲染不可用，正在显示静态场景
    </div>
    <slot /><Compass :camera="controller.camera" />
  </div>
</template>
