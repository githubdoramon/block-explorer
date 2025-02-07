<template>
  <div class="token-icon-label">
    <AddressLink :address="address" class="token-link" :data-testid="$testId?.tokensIcon">
      <span v-if="showLinkSymbol" class="token-symbol">
        <span v-if="symbol">
          {{ symbol }}
        </span>
        <span class="unknown-token-symbol" v-else>{{ t("balances.table.unknownSymbol") }}</span>
      </span>
      <div class="token-icon-container" :class="iconSize">
        <div class="token-img-loader"></div>
        <img class="token-img" :class="{ loaded: isImageReady }" :src="imgSource" :alt="symbol!" />
      </div>
    </AddressLink>
    <div class="token-info" v-if="name && symbol">
      <div class="token-symbol">
        {{ symbol }}
      </div>
      <div class="token-name">
        {{ name }}
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { computed, type PropType } from "vue";
import { useI18n } from "vue-i18n";

import { useImage } from "@vueuse/core";

import AddressLink from "@/components/AddressLink.vue";

import useTokenLibrary from "@/composables/useTokenLibrary";

import type { Hash } from "@/types";

export type IconSize = "sm" | "md" | "lg" | "xl";

const { t } = useI18n();

const props = defineProps({
  address: {
    type: String as PropType<Hash>,
    required: true,
  },
  symbol: {
    type: [String, null] as PropType<string | null>,
    required: true,
  },
  iconSize: {
    type: String as PropType<IconSize>,
    default: "sm",
  },
  imageUrl: {
    type: String,
    default: "",
  },
  showLinkSymbol: {
    type: Boolean,
    default: false,
  },
  name: {
    type: String,
    default: "",
  },
});

const {
  isRequestPending: isTokensRequestPending,
  isRequestFailed: isTokensRequestFailed,
  getToken,
  getTokens,
} = useTokenLibrary();

getTokens();

const imgSource = computed(() => {
  if (props.imageUrl) {
    return props.imageUrl;
  }
  const tokenFromLibrary = getToken(props.address);
  return tokenFromLibrary ? tokenFromLibrary.imageUrl : "/images/currencies/customToken.svg";
});
const { isReady: isImageLoaded } = useImage({ src: imgSource.value });
const isImageReady = computed(
  () => (!isTokensRequestPending.value && !isTokensRequestFailed.value && isImageLoaded.value) || props.imageUrl
);
</script>

<style lang="scss">
.token-icon-label {
  @apply flex items-center gap-x-2 text-sm;

  .token-link {
    @apply flex items-center gap-x-1;

    .unknown-token-symbol {
      @apply italic;
    }

    .token-icon-container {
      @apply relative overflow-hidden rounded-full;
      &.sm {
        @apply h-4 w-4;
      }
      &.md {
        @apply h-5 w-5;
      }
      &.lg {
        @apply h-6 w-6;
      }
      &.xl {
        @apply h-8 w-8;
      }

      .token-img-loader,
      .token-img {
        @apply absolute inset-0 h-full w-full rounded-full;
      }
      .token-img-loader {
        @apply animate-pulse bg-neutral-200;
      }
      .token-img {
        @apply opacity-0 transition-opacity duration-150;
        &.loaded {
          @apply opacity-100;
        }
      }
    }
  }
  .token-info {
    .token-symbol {
      @apply text-neutral-600;
    }
    .token-name {
      @apply text-xs text-neutral-400;
    }
  }
}
</style>
