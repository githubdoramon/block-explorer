<template>
  <div>
    <div class="fee-info-container">
      <TokenAmountPrice :token="token" :amount="feeData?.amountPaid" />
      <button v-if="showDetails" class="toggle-button" @click="collapsed = !collapsed" type="button">
        {{ buttonTitle }}
      </button>
    </div>
    <div class="details-container" v-if="collapsed">
      <div class="details-data-container">
        <div class="details-title">{{ t("transactions.table.feeDetails.initial") }}</div>
        <TokenAmountPrice :token="token" :amount="initialFee!" />
      </div>
      <div class="details-data-container">
        <div class="details-title">{{ t("transactions.table.feeDetails.refunded") }}</div>
        <TokenAmountPrice :token="token" :amount="feeData?.amountRefunded" />
      </div>
      <div class="fee-transfers-container">
        <div class="details-title">{{ t("transactions.table.feeDetails.refunds") }}</div>
        <div v-for="(transfer, index) in feeData?.refunds" :key="index">
          <TransferTableCell :transfer="transfer" />
        </div>
      </div>
      <a
        class="refunded-link"
        href="https://era.zksync.io/docs/dev/developer-guides/transactions/fee-model.html#refunds"
        target="_blank"
        >{{ t("transactions.table.feeDetails.whyRefunded") }}</a
      >
    </div>
  </div>
</template>
<script lang="ts" setup>
import { computed, type PropType, ref } from "vue";
import { useI18n } from "vue-i18n";

import { BigNumber } from "ethers";

import TokenAmountPrice from "@/components/TokenAmountPrice.vue";
import TransferTableCell from "@/components/transactions/infoTable/TransferTableCell.vue";

import useToken from "@/composables/useToken";

import type { Token } from "@/composables/useToken";
import type { FeeData } from "@/composables/useTransaction";

import { ETH_TOKEN } from "@/utils/constants";

const props = defineProps({
  showDetails: {
    type: Boolean,
    default: () => true,
  },
  feeData: {
    type: Object as PropType<FeeData | null>,
    default: () => ({}),
  },
});
const { t } = useI18n();

const { getTokenInfo, tokenInfo } = useToken();
const collapsed = ref(false);
const buttonTitle = computed(() =>
  collapsed.value ? t("transactions.table.feeDetails.closeDetails") : t("transactions.table.feeDetails.moreDetails")
);
getTokenInfo(ETH_TOKEN.l2Address);

const initialFee = computed(() => {
  if (props.feeData) {
    return BigNumber.from(props.feeData.amountPaid).add(props.feeData.amountRefunded).toHexString();
  }
  return null;
});
const token = computed<Token>(() => {
  return tokenInfo.value ?? { ...ETH_TOKEN, usdPrice: null };
});
</script>
<style lang="scss" scoped>
.fee-info-container {
  @apply flex items-center gap-x-5;
}
.toggle-button {
  @apply text-primary-600 underline hover:text-[#7379E5];
}
.details-container {
  @apply mt-2 flex flex-col gap-y-1 rounded bg-neutral-100 p-2.5;
  .details-data-container {
    @apply flex gap-x-1;
  }
  .details-title {
    @apply font-bold;
  }
  .fee-transfers-container {
    @apply flex flex-col gap-y-1;
  }
  .refunded-link {
    @apply w-max;
  }
}
</style>
