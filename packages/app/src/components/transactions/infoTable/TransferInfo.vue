<template>
  <div class="transfer-info-container">
    <span>{{ label }}</span>
    <TransactionNetworkSquareBlock :network="network" />
    <AddressLink v-if="network !== 'L1'" :address="address" class="address">
      <span>{{ shortenFitText(address, "left") }}</span>
    </AddressLink>
    <a v-else class="address" target="_blank" :href="`${currentNetwork.l1ExplorerUrl}/address/${address}`">
      <span>{{ shortenFitText(address, "left") }}</span>
    </a>
    <CopyButton :value="address" class="copy-btn" />
  </div>
</template>

<script lang="ts" setup>
import AddressLink from "@/components/AddressLink.vue";
import CopyButton from "@/components/common/CopyButton.vue";
import { shortenFitText } from "@/components/common/HashLabel.vue";
import TransactionNetworkSquareBlock from "@/components/transactions/TransactionNetworkSquareBlock.vue";

import useContext from "@/composables/useContext";

import type { Hash, NetworkOrigin } from "@/types";
import type { PropType } from "vue";
defineProps({
  label: {
    type: String,
    required: true,
  },
  address: {
    type: String as PropType<Hash>,
    required: true,
  },
  network: {
    type: String as PropType<NetworkOrigin>,
    required: true,
    default: "L1",
  },
});
const { currentNetwork } = useContext();
</script>

<style lang="scss" scoped>
.transfer-info-container {
  @apply flex text-sm;
  .transactions-data-link-network {
    @apply ml-2 mr-1;
  }
  .copy-btn {
    @apply -top-px -mr-1.5 inline-block align-top;
  }
  .address {
    @apply mr-1;
  }
}
</style>
