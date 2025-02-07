import { describe, expect, it } from "vitest";

import { mount, RouterLinkStub } from "@vue/test-utils";

import AddressLink from "@/components/AddressLink.vue";

const global = {
  stubs: {
    RouterLink: RouterLinkStub,
  },
  plugins: [],
};

describe("Address Link", () => {
  it("renders default state", async () => {
    const wrapper = mount(AddressLink, {
      global,
      props: {
        address: "0xc31f9d4cbf557b6cf0ad2af66d44c358f7fa7a16",
      },
    });
    expect(wrapper.text()).toBe("0xc31F9d4cbf557b6cF0AD2AF66D44c358F7Fa7a16");
  });
  it("renders default slot", async () => {
    const wrapper = mount(AddressLink, {
      global,
      props: {
        address: "0xc31f9d4cbf557b6cf0ad2af66d44c358f7fa7a16",
      },
      slots: {
        default: "Default Slot",
      },
    });
    expect(wrapper.text()).toBe("Default Slot");
  });
  it("renders the link", async () => {
    const wrapper = mount(AddressLink, {
      global,
      props: {
        address: "0x0000000000000000000000000000000000000001",
      },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(RouterLinkStub).props().to.name).toBe("address");
    expect(wrapper.findComponent(RouterLinkStub).props().to.params.address).toBe(
      "0x0000000000000000000000000000000000000001"
    );
  });
  it("renders link that goes to etherscan if network is 'L1'", async () => {
    const wrapper = mount(AddressLink, {
      global,
      props: {
        address: "0x0000000000000000000000000000000000000001",
        network: "L1",
      },
    });
    expect(wrapper.find("a").attributes().href).toBe(
      "https://goerli.etherscan.io/address/0x0000000000000000000000000000000000000001"
    );
  });
});
