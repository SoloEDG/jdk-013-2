<script setup lang="ts">
import { ref } from "vue";
import { MonitorPlay, Tv, Waves } from "lucide-vue-next";
import type { GuideRole } from "../model/protocol";
import {
  loadDisplayName,
  saveDisplayName,
  saveRole,
} from "../lib/identity";

const emit = defineEmits<{ choose: [role: GuideRole, name: string] }>();
const hostName = ref(loadDisplayName("host"));
const viewerName = ref(loadDisplayName("viewer"));

function choose(role: GuideRole) {
  const name = (role === "host" ? hostName : viewerName).value.trim();
  const finalName = name || (role === "host" ? "讲解员" : "观众屏");
  saveRole(role);
  saveDisplayName(role, finalName);
  emit("choose", role, finalName);
}
</script>

<template>
  <div class="role-shell">
    <div class="role-card">
      <span class="role-brand"><Waves :size="22" /></span>
      <small>DUAL-SCREEN GUIDED TOUR</small>
      <h1>双窗口导览</h1>
      <p>请选择这块屏幕在本次导览中的身份。两块屏幕需选择不同身份。</p>
      <div class="role-options">
        <label>
          <MonitorPlay :size="20" />
          <span>讲解员控制屏</span>
          <small>选择章节、转动镜头、接管观众屏</small>
          <input
            v-model="hostName"
            aria-label="讲解员名称"
            placeholder="讲解员名称"
            maxlength="12"
          />
          <button class="primary" @click="choose('host')">
            以讲解员身份进入
          </button>
        </label>
        <label>
          <Tv :size="20" />
          <span>观众观看屏</span>
          <small>同步主线，也可临时查看人物支线</small>
          <input
            v-model="viewerName"
            aria-label="观众屏名称"
            placeholder="观众屏名称"
            maxlength="12"
          />
          <button class="primary" @click="choose('viewer')">
            以观众身份进入
          </button>
        </label>
      </div>
    </div>
  </div>
</template>
