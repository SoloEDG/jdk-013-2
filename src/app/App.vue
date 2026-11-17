<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Waves,
  ArrowUpRight,
  MapPin,
  MousePointer2,
  Eye,
  Headphones,
  BookOpen,
  Compass,
  ChevronRight,
  X,
  Lock,
  Undo2,
} from "lucide-vue-next";
import { PanoramaView } from "../features/panorama";
import { ChapterList, MediaPlayer, Transport } from "../features/chapters";
import { HotspotLayer, HotspotDetail } from "../features/hotspots";
import { InterviewPanel, PeopleList } from "../features/interviews";
import { JournalPanel } from "../features/journal";
import { RolePicker, GuideDock } from "../features/guide";
import type { GuideRole } from "../features/guide";
import { createWorkspace, type Workspace } from "./workspace";

const role = ref<GuideRole | null>(null);
const displayName = ref("");
const about = ref(false);
const stage = ref<HTMLElement>();
const fullError = ref("");

let w: Workspace | null = null;
const workspace = computed(() => w);

function chooseRole(next: GuideRole, name: string) {
  role.value = next;
  displayName.value = name;
  w = createWorkspace({ role: next, displayName: name });
}

function fullscreen() {
  if (!w) return;
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.value?.requestFullscreen();
  } catch {
    fullError.value = "当前浏览器不支持全屏";
  }
}
</script>

<template>
  <RolePicker v-if="!role || !workspace" @choose="chooseRole" />
  <div v-else class="site-shell">
    <header class="site-header">
      <a class="brand" href="#" @click.prevent="w!.tab.value = 'story'"
        ><span class="brand-icon"><Waves /></span
        ><b>岸线 <i>SHORELINE</i></b></a
      >
      <nav aria-label="主导航">
        <button
          :class="{ active: w!.tab.value === 'story' }"
          @click="w!.tab.value = 'story'"
        >
          互动纪录片</button
        ><button
          :class="{ active: w!.tab.value === 'journal' }"
          @click="w!.tab.value = 'journal'"
        >
          探索手记 <span>{{ w!.journal.entries.value.length }}</span></button
        ><button @click="about = true">
          关于本片 <ArrowUpRight :size="13" />
        </button>
      </nav>
      <div class="edition">
        {{ w!.role === "host" ? "讲解员控制屏" : "观众观看屏" }}
        <span>{{ displayName }}</span>
      </div>
    </header>

    <GuideDock :w="w!" />

    <main>
      <div class="intro">
        <div>
          <p class="eyebrow"><span /> AN IMMERSIVE DOCUMENTARY</p>
          <h1>潮汐之间<span>Between the Tides</span></h1>
          <p class="intro-copy">把目光交给远方，把时间留给故事。</p>
        </div>
        <div class="intro-meta">
          <span>中国 · 东南沿海</span>
          <p>3 个章节 <i>/</i> 360° 自由探索 <i>/</i> 3 位讲述者</p>
        </div>
      </div>
      <template v-if="w!.tab.value === 'story'"
        ><div class="workspace">
          <section ref="stage" class="stage">
            <!-- 观众被接管提示：明确本次控制权归属，看支线时仍可见 -->
            <div v-if="w!.following" class="takeover-banner">
              <Lock :size="13" />
              <template v-if="w!.inLocalOverride">
                你正在查看个人支线，讲解员主线不受影响
                <button class="text-button" @click="w!.dispatch({ type: 'return' })">
                  <Undo2 :size="13" /> 回到讲解员主线
                </button>
              </template>
              <template v-else>
                主线由讲解员「{{ w!.hostName }}」控制
              </template>
            </div>
            <PanoramaView
              :controller="w!.camera"
              :source="w!.playback.chapter.value.panorama"
              :locked="w!.locked && w!.syncMode === 'camera'"
              @move="w!.moveCamera($event.dx, $event.dy)"
              @zoom="w!.zoomCamera($event)"
              ><MediaPlayer
                :playback="w!.playback"
                :branch="!!w!.branch.personId.value"
              />
              <div class="stage-shade" />
              <div class="stage-top">
                <span class="scene-badge"><span /> 360° 全景现场</span
                ><span class="location"
                  ><MapPin :size="13" />
                  {{ w!.playback.chapter.value.location }}</span
                >
              </div>
              <HotspotLayer
                :items="w!.discovery.visible.value"
                :camera="w!.camera.camera"
                :enabled="w!.discovery.enabled.value && !w!.branch.personId.value"
                @open="w!.dispatch({ type: 'hotspot', id: $event })"
              />
              <div class="scene-caption">
                <small
                  >CHAPTER 0{{
                    ["dawn", "craft", "night"].indexOf(
                      w!.playback.state.chapterId,
                    ) + 1
                  }}</small
                >
                <h2>{{ w!.playback.chapter.value.title }}</h2>
                <p>{{ w!.playback.chapter.value.description }}</p>
              </div>
              <div class="drag-hint">
                <MousePointer2 :size="14" />
                {{
                  w!.locked && w!.syncMode === "camera"
                    ? "视角由讲解员带动"
                    : "按住拖动，环顾四周"
                }}
              </div></PanoramaView
            ><HotspotDetail
              v-if="w!.discovery.detail.value && !w!.branch.personId.value"
              :hotspot="w!.discovery.detail.value"
              :saved="w!.journal.has(w!.discovery.detail.value.id)"
              @close="w!.closeHotspot()"
              @save="w!.save()"
              @interview="
                w!.enterPerson(w!.discovery.detail.value?.personId || '')
              "
            /><InterviewPanel
              :branch="w!.branch"
              @back="w!.dispatch({ type: 'return' })"
            /><Transport
              :playback="w!.playback"
              :disabled="!!w!.branch.personId.value || w!.locked"
              :locked="w!.locked"
              @toggle="w!.togglePlay()"
              @seek="w!.seekLocal($event)"
              @reset="w!.resetCamera()"
              @fullscreen="fullscreen"
            />
            <p v-if="fullError" role="status">{{ fullError }}</p>
          </section>
          <aside class="sidebar">
            <div class="section-heading">
              <h2>故事章节</h2>
              <span>CHAPTERS</span>
            </div>
            <p class="sidebar-copy">循着潮水，走进他们的日常。</p>
            <ChapterList
              :active="w!.playback.state.chapterId"
              :locked="w!.locked"
              @select="w!.dispatch({ type: 'chapter', id: $event })"
            />
            <div class="chapter-foot">
              <Headphones :size="15" /><span>建议佩戴耳机，沉浸聆听</span>
            </div>
            <div class="explore-toggle">
              <span><Eye :size="17" /> 场景探索热点</span
              ><button
                role="switch"
                aria-label="显示热点"
                :aria-checked="w!.discovery.enabled.value"
                :class="{ on: w!.discovery.enabled.value }"
                @click="w!.discovery.enabled.value = !w!.discovery.enabled.value"
              >
                <i />
              </button>
            </div>
            <div class="discovery-count">
              <span>已收集的故事</span
              ><b
                >{{
                  w!.journal.entries.value.length.toString().padStart(2, "0")
                }}
                <em>/ 06</em></b
              >
            </div>
            <button class="journal-link" @click="w!.tab.value = 'journal'">
              <BookOpen :size="15" /> 打开我的探索手记
              <ChevronRight :size="15" />
            </button>
          </aside>
        </div>
        <section class="below">
          <div class="field-note">
            <small><Compass :size="14" /> EXPLORER'S NOTE</small>
            <h2>故事，不止一个方向。</h2>
            <p>
              试着转动视角，寻找画面里的微光。<br />每个热点都通向一段值得停留的时光。
            </p>
          </div>
          <div class="voices">
            <div class="section-heading">
              <h2>听见他们的故事</h2>
              <span>THE VOICES</span>
            </div>
            <PeopleList @open="w!.enterPerson($event)" />
          </div></section></template
      ><JournalPanel
        v-else
        :journal="w!.journal"
        @revisit="w!.dispatch({ type: 'revisit', entry: $event })"
      />
      <footer>
        <span>SHORELINE ORIGINALS <i>© 2026</i></span
        ><span>让每一段平凡的生活，被看见。 <Waves :size="18" /></span>
      </footer>
    </main>
    <div v-if="about" class="modal-backdrop" @click.self="about = false">
      <section
        class="about"
        role="dialog"
        aria-modal="true"
        aria-label="关于本片"
      >
        <button class="close" aria-label="关闭关于" @click="about = false">
          <X /></button
        ><small>ABOUT THE FILM</small>
        <h2>潮汐之间</h2>
        <p>
          以海港、木船与灯塔为线索的互动纪录片演示。全景为原创程序绘制示意场景，章节影像为本地生成的潮汐动画；人物与口述内容均为虚构，用于体验非线性叙事。
        </p>
        <p>
          双窗口导览下，讲解员控制屏可选择仅同步播放位置或同时带动视角；观众屏可临时进入人物支线，返回后回到讲解员当前主线。两屏的探索手记各自独立存储，互不可见、互不覆盖。
        </p>
        <button class="primary" @click="about = false">开始探索 ↗</button>
      </section>
    </div>
  </div>
</template>
