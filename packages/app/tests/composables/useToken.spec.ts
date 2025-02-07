/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, type SpyInstance, vi } from "vitest";

import { useContextMock } from "./../mocks";

import useToken from "@/composables/useToken";

const token: Api.Response.Token = {
  l1Address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  l2Address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeb",
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
};

vi.mock("@/composables/useTokenPrice", () => {
  return {
    retrieveTokenPrice: () => Promise.resolve("3500"),
  };
});
vi.mock("@/composables/useTokenLibrary", () => {
  return {
    default: () => ({
      getTokens: () => undefined,
      getToken: () => token,
    }),
  };
});
vi.mock("ohmyfetch", () => {
  return {
    $fetch: vi.fn(() => Promise.resolve(token)),
  };
});

describe("useToken:", () => {
  let mockContext: SpyInstance;
  beforeEach(() => {
    mockContext = useContextMock();
  });
  afterEach(() => {
    mockContext?.mockRestore();
  });

  it("requests token info", async () => {
    const { getTokenInfo, tokenInfo } = useToken();
    await getTokenInfo(token.l2Address);
    expect(tokenInfo.value).toEqual({
      address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeb",
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
      usdPrice: "3500",
    });
  });
});
