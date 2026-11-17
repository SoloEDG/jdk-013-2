<script setup lang="ts">
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  Lock,
} from "lucide-vue-next";
import { timecode } from "../../../shared/format";
import { chapterProgress } from "../lib/timeline";
import type { Playback } from "../model/playback";
const props = defineProps<{
  playback: Playback;
  disabled: boolean;
  /** 跟随期间观众主线播放控制被讲解员接管 */
  locked?: boolean;
}>();
const emit = defineEmits<{
  toggle: [];
  seek: [time: number];
  reset: [];
  fullscreen: [];
}>();
function onSeek(e: Event) {
  if (props.locked || props.disabled) return;
  emit("seek", Number((e.target as HTMLInputElement).value));
}
</script>
<template>
  <div class="transport" :class="{ 'is-locked': locked }">
    <div v-if="locked" class="lock-note">
      <Lock :size="12" /> 播放控制权在讲解员手中，观众仍可点开热点查看人物支线
    </div>
    <div class="timeline-labels">
      <span>本章进度</span
      ><span
        >{{
          chapterProgress(playback.chapter.value, playback.state.time)
        }}%</span
      >
    </div>
    <input
      aria-label="播放进度"
      type="range"
      min="0"
      :max="playback.chapter.value.duration"
      step="0.1"
      :value="playback.state.time"
      :disabled="disabled || locked"
      @input="onSeek"
    />
    <div class="controls">
      <button
        :disabled="disabled || locked"
        :aria-label="playback.state.playing ? '暂停' : '播放'"
        @click="emit('toggle')"
      >
        <Pause v-if="playback.state.playing" /><Play v-else /></button
      ><span class="time"
        >{{ timecode(playback.state.time) }}
        <em>/ {{ timecode(playback.chapter.value.duration) }}</em></span
      ><span class="spacer" /><button
        :aria-label="playback.state.muted ? '开启声音' : '静音'"
        @click="playback.state.muted = !playback.state.muted"
      >
        <VolumeX v-if="playback.state.muted" /><Volume2 v-else /></button
      ><select aria-label="播放速度" v-model="playback.state.rate">
        <option :value="0.5">0.5×</option>
        <option :value="1">1.0×</option>
        <option :value="1.5">1.5×</option></select
      ><button aria-label="重置视角" @click="emit('reset')">
        <RotateCcw /></button
      ><button aria-label="全屏" @click="emit('fullscreen')">
        <Maximize />
      </button>
    </div>
  </div>
</template>
