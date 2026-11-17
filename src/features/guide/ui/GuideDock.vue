<script setup lang="ts">
import { computed } from "vue";
import {
  Radio,
  RadioTower,
  Users,
  Video,
  Crosshair,
  Power,
  Link2,
  Unplug,
  LoaderCircle,
} from "lucide-vue-next";
import type { Workspace } from "../../../app/workspace";

const props = defineProps<{ w: Workspace }>();

const isHost = computed(() => props.w.role === "host");
const statusText = computed(() => {
  if (isHost.value) {
    if (!props.w.guideActive.value) return "导览未开始";
    return `正在导览 · 已连接 ${props.w.viewerCount} 块观众屏`;
  }
  switch (props.w.followStatus) {
    case "connecting":
      return "正在连接讲解员…";
    case "following":
      return `已被「${props.w.hostName}」接管，跟随主线`;
    case "reconnecting":
      return "链路恢复中，等待讲解员最新画面…";
    case "host-closed":
      return "讲解员已结束导览，可独立观看";
    default:
      return "未加入导览";
  }
});
const dotClass = computed(() => {
  if (isHost.value) return props.w.guideActive.value ? "on" : "off";
  return props.w.followStatus === "following" ? "on" : "off";
});
</script>

<template>
  <div class="guide-dock" :class="{ active: w.guideActive.value }">
    <div class="guide-status">
      <span class="guide-dot" :class="dotClass" />
      <RadioTower v-if="isHost" :size="15" />
      <Radio v-else :size="15" />
      <b>{{ statusText }}</b>
      <span v-if="w.inLocalOverride && !isHost" class="guide-tag">
        正在查看个人支线
      </span>
    </div>

    <!-- 讲解员控制 -->
    <div v-if="isHost" class="guide-actions">
      <template v-if="!w.guideActive.value">
        <button class="guide-btn primary" @click="w.startGuiding()">
          <Radio :size="14" /> 开始导览
        </button>
      </template>
      <template v-else>
        <div class="mode-switch" role="group" aria-label="同步范围">
          <button
            :class="{ on: w.syncMode === 'position' }"
            @click="w.setSyncMode('position')"
          >
            <Video :size="13" /> 仅同步位置
          </button>
          <button
            :class="{ on: w.syncMode === 'camera' }"
            @click="w.setSyncMode('camera')"
          >
            <Crosshair :size="13" /> 位置 + 视角
          </button>
        </div>
        <span class="viewer-pill"><Users :size="13" /> {{ w.viewerCount }}</span>
        <button class="guide-btn" @click="w.stopGuiding()">
          <Power :size="14" /> 结束导览
        </button>
      </template>
    </div>

    <!-- 观众控制 -->
    <div v-else class="guide-actions">
      <template v-if="!w.guideActive.value">
        <button class="guide-btn primary" @click="w.joinGuide()">
          <Link2 :size="14" /> 加入导览
        </button>
      </template>
      <template v-else>
        <LoaderCircle
          v-if="w.followStatus === 'connecting'"
          :size="14"
          class="spin"
        />
        <button class="guide-btn" @click="w.leaveGuide()">
          <Unplug :size="14" /> 退出并独立观看
        </button>
      </template>
    </div>
  </div>
</template>
