<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { isCurrent } from './paths.js'
import type { NavItem } from './registry.js'
import { useServices } from './services.js'

/** The shell every page is shown in: the header and navigation, the session notice, the page and the dialog. */

defineProps<{ readonly nav: readonly NavItem[] }>()

const route = useRoute()
const { session, confirmer } = useServices()
const expired = session.expired
const question = confirmer.current
</script>

<template>
  <header class="top">
    <RouterLink class="brand" to="/">MindLink</RouterLink>
    <nav class="nav" aria-label="主导航">
      <RouterLink
        v-for="item in nav"
        :key="item.path"
        v-slot="{ href, navigate }"
        :to="item.path"
        custom
      >
        <a
          :href="href"
          :aria-current="isCurrent(item.path, route.path) ? 'page' : undefined"
          @click="navigate"
          >{{ item.label }}</a
        >
      </RouterLink>
    </nav>
  </header>
  <div v-if="expired" class="notice" role="alert">
    <span>登录已过期。重新载入页面即可继续。</span>
    <button type="button" @click="session.reload()">重新载入</button>
  </div>
  <main id="page" class="page">
    <RouterView />
  </main>
  <ConfirmDialog v-if="question !== undefined" :spec="question" @answer="confirmer.answer" />
</template>
