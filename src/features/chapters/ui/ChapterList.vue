<script setup lang="ts">
import { chapters } from "../../../shared/content";
import { timecode } from "../../../shared/format";
defineProps<{ active: string; locked?: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
function choose(id: string, locked?: boolean) {
  if (locked) return;
  emit("select", id);
}
</script>
<template>
  <div class="chapter-list" :class="{ 'is-locked': locked }">
    <button
      v-for="(chapter, i) in chapters"
      :key="chapter.id"
      :class="{ active: active === chapter.id }"
      :disabled="locked"
      @click="choose(chapter.id, locked)"
    >
      <div
        class="chapter-thumb"
        :style="{ backgroundImage: `url(${chapter.panorama})` }"
      >
        <span>0{{ i + 1 }}</span
        ><small>{{ timecode(chapter.duration) }}</small>
      </div>
      <div>
        <small>CHAPTER 0{{ i + 1 }}</small>
        <h3>{{ chapter.title }}</h3>
        <p>{{ chapter.subtitle }}</p>
      </div>
      <b>{{ active === chapter.id ? "正在探索" : "↗" }}</b>
    </button>
  </div>
</template>
