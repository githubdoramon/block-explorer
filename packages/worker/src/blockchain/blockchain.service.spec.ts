import * as ethers from "ethers";
import { mock } from "jest-mock-extended";
import { utils, types } from "zksync-web3";
import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as timersPromises from "timers/promises";
import { BlockchainService, BridgeAddresses } from "./blockchain.service";
import { JsonRpcProviderBase } from "../rpcProvider";
import { RetryableContract } from "./retryableContract";

jest.mock("./retryableContract");

describe("BlockchainService", () => {
  const l2Erc20Bridge = "l2Erc20Bridge";
  let blockchainService: BlockchainService;
  let provider: JsonRpcProviderBase;
  let providerFormatterMock;
  let configServiceMock: ConfigService;
  let startRpcCallDurationMetricMock: jest.Mock;
  let stopRpcCallDurationMetricMock: jest.Mock;
  const defaultRetryTimeout = 2;
  const quickRetryTimeout = 1;

  beforeEach(async () => {
    providerFormatterMock = {
      blockTag: jest.fn(),
    };

    provider = mock<JsonRpcProviderBase>({
      formatter: providerFormatterMock,
    });

    configServiceMock = mock<ConfigService>({
      get: jest.fn().mockImplementation((configName) => {
        return configName === "blockchain.rpcCallDefaultRetryTimeout" ? defaultRetryTimeout : quickRetryTimeout;
      }),
    });

    stopRpcCallDurationMetricMock = jest.fn();
    startRpcCallDurationMetricMock = jest.fn().mockReturnValue(stopRpcCallDurationMetricMock);

    const app: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: JsonRpcProviderBase,
          useValue: provider,
        },
        {
          provide: "PROM_METRIC_BLOCKCHAIN_RPC_CALL_DURATION_SECONDS",
          useValue: {
            startTimer: startRpcCallDurationMetricMock,
          },
        },
      ],
    }).compile();

    app.useLogger(mock<Logger>());

    blockchainService = app.get<BlockchainService>(BlockchainService);

    blockchainService.bridgeAddresses = mock<BridgeAddresses>({
      l2Erc20DefaultBridge: l2Erc20Bridge.toLowerCase(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getL1BatchNumber", () => {
    const batchNumber = 10;
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getL1BatchNumber").mockResolvedValue(batchNumber);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getL1BatchNumber();
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets batch number", async () => {
      await blockchainService.getL1BatchNumber();
      expect(provider.getL1BatchNumber).toHaveBeenCalledTimes(1);
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getL1BatchNumber();
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getL1BatchNumber" });
    });

    it("returns the batch number", async () => {
      const result = await blockchainService.getL1BatchNumber();
      expect(result).toEqual(batchNumber);
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getL1BatchNumber")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(batchNumber);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getL1BatchNumber();
        expect(provider.getL1BatchNumber).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getL1BatchNumber();
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getL1BatchNumber" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getL1BatchNumber();
        expect(result).toEqual(batchNumber);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getL1BatchNumber")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(batchNumber);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getL1BatchNumber();
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getL1BatchNumber")
          .mockRejectedValueOnce({ code: "ECONNREFUSED" })
          .mockRejectedValueOnce({ code: "ECONNREFUSED" })
          .mockResolvedValueOnce(batchNumber);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getL1BatchNumber();
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection reset error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getL1BatchNumber")
          .mockRejectedValueOnce({ code: "ECONNRESET" })
          .mockRejectedValueOnce({ code: "ECONNRESET" })
          .mockResolvedValueOnce(batchNumber);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getL1BatchNumber();
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a network error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getL1BatchNumber")
          .mockRejectedValueOnce({ code: "NETWORK_ERROR" })
          .mockRejectedValueOnce({ code: "NETWORK_ERROR" })
          .mockResolvedValueOnce(batchNumber);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getL1BatchNumber();
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("getBatchDetails", () => {
    const batchNumber = 10;
    const batchDetails: types.BatchDetails = mock<types.BatchDetails>({ number: 10 });
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getL1BatchDetails").mockResolvedValue(batchDetails);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getL1BatchDetails(batchNumber);
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets batch details by the specified batch number", async () => {
      await blockchainService.getL1BatchDetails(batchNumber);
      expect(provider.getL1BatchDetails).toHaveBeenCalledTimes(1);
      expect(provider.getL1BatchDetails).toHaveBeenCalledWith(batchNumber);
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getL1BatchDetails(batchNumber);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getL1BatchDetails" });
    });

    it("returns the batch details", async () => {
      const result = await blockchainService.getL1BatchDetails(batchNumber);
      expect(result).toEqual(batchDetails);
    });

    it("sets default committedAt, provenAt and executedAt for the very first batch", async () => {
      jest.spyOn(provider, "getL1BatchDetails").mockResolvedValueOnce({ number: 0 } as types.BatchDetails);
      const result = await blockchainService.getL1BatchDetails(0);
      expect(result).toEqual({
        number: 0,
        committedAt: new Date(0),
        provenAt: new Date(0),
        executedAt: new Date(0),
      });
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getL1BatchDetails")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(batchDetails);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getL1BatchDetails(batchNumber);
        expect(provider.getL1BatchDetails).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getL1BatchDetails(batchNumber);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getL1BatchDetails" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getL1BatchDetails(batchNumber);
        expect(result).toEqual(batchDetails);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getL1BatchDetails")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(batchDetails);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getL1BatchDetails(batchNumber);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getL1BatchDetails")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(batchDetails);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getL1BatchDetails(batchNumber);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("getBlock", () => {
    const blockNumber = 10;
    const block: types.Block = mock<types.Block>({ number: 10 });
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getBlock").mockResolvedValue(block);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getBlock(blockNumber);
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets block by the specified block number", async () => {
      await blockchainService.getBlock(blockNumber);
      expect(provider.getBlock).toHaveBeenCalledTimes(1);
      expect(provider.getBlock).toHaveBeenCalledWith(blockNumber);
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getBlock(blockNumber);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getBlock" });
    });

    it("returns the block", async () => {
      const result = await blockchainService.getBlock(blockNumber);
      expect(result).toEqual(block);
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getBlock")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(block);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getBlock(blockNumber);
        expect(provider.getBlock).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getBlock(blockNumber);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getBlock" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getBlock(blockNumber);
        expect(result).toEqual(block);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getBlock")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(block);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getBlock(blockNumber);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getBlock")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(block);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getBlock(blockNumber);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("getBlockNumber", () => {
    const blockNumber = 10;
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getBlockNumber").mockResolvedValue(blockNumber);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getBlockNumber();
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets block number", async () => {
      await blockchainService.getBlockNumber();
      expect(provider.getBlockNumber).toHaveBeenCalledTimes(1);
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getBlockNumber();
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getBlockNumber" });
    });

    it("returns the block number", async () => {
      const result = await blockchainService.getBlockNumber();
      expect(result).toEqual(blockNumber);
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getBlockNumber")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(blockNumber);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getBlockNumber();
        expect(provider.getBlockNumber).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getBlockNumber();
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getBlockNumber" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getBlockNumber();
        expect(result).toEqual(blockNumber);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getBlockNumber")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(blockNumber);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getBlockNumber();
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getBlockNumber")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(blockNumber);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getBlockNumber();
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("getBlockDetails", () => {
    const blockNumber = 10;
    const blockDetails: types.BlockDetails = mock<types.BlockDetails>({ number: 10 });
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getBlockDetails").mockResolvedValue(blockDetails);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getBlockDetails(blockNumber);
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets block details by the specified block number", async () => {
      await blockchainService.getBlockDetails(blockNumber);
      expect(provider.getBlockDetails).toHaveBeenCalledTimes(1);
      expect(provider.getBlockDetails).toHaveBeenCalledWith(blockNumber);
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getBlockDetails(blockNumber);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getBlockDetails" });
    });

    it("returns the block details", async () => {
      const result = await blockchainService.getBlockDetails(blockNumber);
      expect(result).toEqual(blockDetails);
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getBlockDetails")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(blockDetails);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getBlockDetails(blockNumber);
        expect(provider.getBlockDetails).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getBlockDetails(blockNumber);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getBlockDetails" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getBlockDetails(blockNumber);
        expect(result).toEqual(blockDetails);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getBlockDetails")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(blockDetails);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getBlockDetails(blockNumber);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getBlockDetails")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(blockDetails);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getBlockDetails(blockNumber);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("getTransaction", () => {
    const transactionHash = "transactionHash";
    const transaction: types.TransactionResponse = mock<types.TransactionResponse>({ hash: "transactionHash" });
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getTransaction").mockResolvedValue(transaction);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getTransaction(transactionHash);
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets transaction by the specified hash", async () => {
      await blockchainService.getTransaction(transactionHash);
      expect(provider.getTransaction).toHaveBeenCalledTimes(1);
      expect(provider.getTransaction).toHaveBeenCalledWith(transactionHash);
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getTransaction(transactionHash);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getTransaction" });
    });

    it("returns the transaction", async () => {
      const result = await blockchainService.getTransaction(transactionHash);
      expect(result).toEqual(transaction);
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getTransaction")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(transaction);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getTransaction(transactionHash);
        expect(provider.getTransaction).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getTransaction(transactionHash);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getTransaction" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getTransaction(transactionHash);
        expect(result).toEqual(transaction);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getTransaction")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(transaction);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getTransaction(transactionHash);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getTransaction")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(transaction);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getTransaction(transactionHash);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("getTransactionDetails", () => {
    const transactionHash = "transactionHash";
    const transactionDetails: types.TransactionDetails = mock<types.TransactionDetails>({
      initiatorAddress: "initiatorAddress",
    });
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getTransactionDetails").mockResolvedValue(transactionDetails);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getTransactionDetails(transactionHash);
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets transaction details by the specified hash", async () => {
      await blockchainService.getTransactionDetails(transactionHash);
      expect(provider.getTransactionDetails).toHaveBeenCalledTimes(1);
      expect(provider.getTransactionDetails).toHaveBeenCalledWith(transactionHash);
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getTransactionDetails(transactionHash);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getTransactionDetails" });
    });

    it("returns the transaction details", async () => {
      const result = await blockchainService.getTransactionDetails(transactionHash);
      expect(result).toEqual(transactionDetails);
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getTransactionDetails")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(transactionDetails);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getTransactionDetails(transactionHash);
        expect(provider.getTransactionDetails).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getTransactionDetails(transactionHash);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getTransactionDetails" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getTransactionDetails(transactionHash);
        expect(result).toEqual(transactionDetails);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getTransactionDetails")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(transactionDetails);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getTransactionDetails(transactionHash);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getTransactionDetails")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(transactionDetails);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getTransactionDetails(transactionHash);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("getTransactionReceipt", () => {
    const transactionHash = "transactionHash";
    const transactionReceipt: types.TransactionReceipt = mock<types.TransactionReceipt>({
      transactionHash: "initiatorAddress",
    });
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getTransactionReceipt").mockResolvedValue(transactionReceipt);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getTransactionReceipt(transactionHash);
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets transaction receipt by the specified hash", async () => {
      await blockchainService.getTransactionReceipt(transactionHash);
      expect(provider.getTransactionReceipt).toHaveBeenCalledTimes(1);
      expect(provider.getTransactionReceipt).toHaveBeenCalledWith(transactionHash);
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getTransactionReceipt(transactionHash);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getTransactionReceipt" });
    });

    it("returns the transaction receipt", async () => {
      const result = await blockchainService.getTransactionReceipt(transactionHash);
      expect(result).toEqual(transactionReceipt);
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getTransactionReceipt")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(transactionReceipt);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getTransactionReceipt(transactionHash);
        expect(provider.getTransactionReceipt).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getTransactionReceipt(transactionHash);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getTransactionReceipt" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getTransactionReceipt(transactionHash);
        expect(result).toEqual(transactionReceipt);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getTransactionReceipt")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(transactionReceipt);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getTransactionReceipt(transactionHash);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getTransactionReceipt")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(transactionReceipt);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getTransactionReceipt(transactionHash);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("getLogs", () => {
    const fromBlock = 10;
    const toBlock = 20;
    const logs: types.Log[] = [mock<types.Log>({ logIndex: 1 }), mock<types.Log>({ logIndex: 2 })];
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getLogs").mockResolvedValue(logs);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getLogs({ fromBlock, toBlock });
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets logs by the specified from and to block numbers", async () => {
      await blockchainService.getLogs({ fromBlock, toBlock });
      expect(provider.getLogs).toHaveBeenCalledTimes(1);
      expect(provider.getLogs).toHaveBeenCalledWith({ fromBlock, toBlock });
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getLogs({ fromBlock, toBlock });
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getLogs" });
    });

    it("returns the logs", async () => {
      const result = await blockchainService.getLogs({ fromBlock, toBlock });
      expect(result).toEqual(logs);
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getLogs")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(logs);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getLogs({ fromBlock, toBlock });
        expect(provider.getLogs).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getLogs({ fromBlock, toBlock });
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getLogs" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getLogs({ fromBlock, toBlock });
        expect(result).toEqual(logs);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getLogs")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(logs);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getLogs({ fromBlock, toBlock });
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getLogs")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(logs);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getLogs({ fromBlock, toBlock });
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("getCode", () => {
    const address = "address";
    const bytecode = "0x0123345";
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getCode").mockResolvedValue(bytecode);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getCode(address);
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets bytecode for the specified address", async () => {
      await blockchainService.getCode(address);
      expect(provider.getCode).toHaveBeenCalledTimes(1);
      expect(provider.getCode).toHaveBeenCalledWith(address);
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getCode(address);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getCode" });
    });

    it("returns the bytecode", async () => {
      const result = await blockchainService.getCode(address);
      expect(result).toEqual(bytecode);
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getCode")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(bytecode);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getCode(address);
        expect(provider.getCode).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getCode(address);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getCode" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getCode(address);
        expect(result).toEqual(bytecode);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getCode")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(bytecode);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getCode(address);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getCode")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(bytecode);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getCode(address);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("getDefaultBridgeAddresses", () => {
    const bridgeAddress = {
      erc20L1: "erc20L1",
      erc20L2: "erc20L2",
      wethL1: "wethL1",
      wethL2: "wethL2",
    };
    let timeoutSpy;

    beforeEach(() => {
      jest.spyOn(provider, "getDefaultBridgeAddresses").mockResolvedValue(bridgeAddress);
      timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
    });

    it("starts the rpc call duration metric", async () => {
      await blockchainService.getDefaultBridgeAddresses();
      expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
    });

    it("gets bridge addresses", async () => {
      await blockchainService.getDefaultBridgeAddresses();
      expect(provider.getDefaultBridgeAddresses).toHaveBeenCalledTimes(1);
    });

    it("stops the rpc call duration metric", async () => {
      await blockchainService.getDefaultBridgeAddresses();
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getDefaultBridgeAddresses" });
    });

    it("returns bridge addresses", async () => {
      const result = await blockchainService.getDefaultBridgeAddresses();
      expect(result).toEqual(bridgeAddress);
    });

    describe("if the call throws an error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getDefaultBridgeAddresses")
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockRejectedValueOnce(new Error("RPC call error"))
          .mockResolvedValueOnce(bridgeAddress);
      });

      it("retries RPC call with a default timeout", async () => {
        await blockchainService.getDefaultBridgeAddresses();
        expect(provider.getDefaultBridgeAddresses).toHaveBeenCalledTimes(3);
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
      });

      it("stops the rpc call duration metric only for the successful retry", async () => {
        await blockchainService.getDefaultBridgeAddresses();
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getDefaultBridgeAddresses" });
      });

      it("returns result of the successful RPC call", async () => {
        const result = await blockchainService.getDefaultBridgeAddresses();
        expect(result).toEqual(bridgeAddress);
      });
    });

    describe("if the call throws a timeout error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getDefaultBridgeAddresses")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(bridgeAddress);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getDefaultBridgeAddresses();
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });

    describe("if the call throws a connection refused error", () => {
      beforeEach(() => {
        jest
          .spyOn(provider, "getDefaultBridgeAddresses")
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockRejectedValueOnce({ code: "TIMEOUT" })
          .mockResolvedValueOnce(bridgeAddress);
      });

      it("retries RPC call with a quick timeout", async () => {
        await blockchainService.getDefaultBridgeAddresses();
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
      });
    });
  });

  describe("on", () => {
    beforeEach(() => {
      provider.on = jest.fn();
    });

    it("subscribes to the new events", () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const handler = () => {};
      blockchainService.on("block", handler);
      expect(provider.on).toHaveBeenCalledTimes(1);
      expect(provider.on).toHaveBeenCalledWith("block", handler);
    });
  });

  describe("getERC20TokenData", () => {
    const contractAddress = "contractAddress";
    const symbol = "symbol";
    const decimals = 18;
    const name = "name";
    let symbolMock: jest.Mock;
    let decimalMock: jest.Mock;
    let nameMock: jest.Mock;

    beforeEach(() => {
      symbolMock = jest.fn().mockResolvedValue(symbol);
      decimalMock = jest.fn().mockResolvedValue(decimals);
      nameMock = jest.fn().mockResolvedValue(name);

      (RetryableContract as any as jest.Mock).mockReturnValue(
        mock<RetryableContract>({
          symbol: symbolMock,
          decimals: decimalMock,
          name: nameMock,
        })
      );
    });

    it("uses ERC20 token contract interface", async () => {
      await blockchainService.getERC20TokenData(contractAddress);
      expect(RetryableContract).toHaveBeenCalledTimes(1);
      expect(RetryableContract).toBeCalledWith(contractAddress, utils.IERC20, provider);
    });

    it("gets contact symbol", async () => {
      await blockchainService.getERC20TokenData(contractAddress);
      expect(symbolMock).toHaveBeenCalledTimes(1);
    });

    it("gets contact decimals", async () => {
      await blockchainService.getERC20TokenData(contractAddress);
      expect(decimalMock).toHaveBeenCalledTimes(1);
    });

    it("gets contact name", async () => {
      await blockchainService.getERC20TokenData(contractAddress);
      expect(nameMock).toHaveBeenCalledTimes(1);
    });

    it("returns token data", async () => {
      const tokenData = await blockchainService.getERC20TokenData(contractAddress);
      expect(tokenData).toEqual({ symbol, decimals, name });
    });

    describe("when contract function throws an error", () => {
      const error = new Error("contract error");

      beforeEach(() => {
        symbolMock = jest.fn().mockImplementation(() => {
          throw error;
        });
        decimalMock = jest.fn().mockResolvedValue(decimals);
        nameMock = jest.fn().mockResolvedValue(name);

        (RetryableContract as any as jest.Mock).mockReturnValue(
          mock<RetryableContract>({
            symbol: symbolMock,
            decimals: decimalMock,
            name: nameMock,
          })
        );
      });

      it("throws an error", async () => {
        await expect(blockchainService.getERC20TokenData(contractAddress)).rejects.toThrowError(error);
      });
    });
  });

  describe("getBalance", () => {
    const blockNumber = 5;
    let blockTag: string;
    let tokenAddress: string;
    const address = "address";

    beforeEach(() => {
      blockTag = "latest";
      tokenAddress = "tokenAddress";
      jest.spyOn(providerFormatterMock, "blockTag").mockReturnValueOnce(blockTag);
    });

    it("gets block tag for the specified blockNumber", async () => {
      await blockchainService.getBalance(address, blockNumber, tokenAddress);
      expect(providerFormatterMock.blockTag).toHaveBeenCalledTimes(1);
      expect(providerFormatterMock.blockTag).toHaveBeenCalledWith(blockNumber);
    });

    describe("if token address is ETH", () => {
      let timeoutSpy;
      const balance = ethers.BigNumber.from(10);

      beforeEach(() => {
        tokenAddress = utils.ETH_ADDRESS;
        jest.spyOn(provider, "getBalance").mockResolvedValue(ethers.BigNumber.from(10));
        timeoutSpy = jest.spyOn(timersPromises, "setTimeout");
      });

      it("starts the rpc call duration metric", async () => {
        await blockchainService.getBalance(address, blockNumber, tokenAddress);
        expect(startRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
      });

      it("gets the balance for ETH", async () => {
        await blockchainService.getBalance(address, blockNumber, tokenAddress);
        expect(provider.getBalance).toHaveBeenCalledTimes(1);
        expect(provider.getBalance).toHaveBeenCalledWith(address, blockTag);
      });

      it("stops the rpc call duration metric", async () => {
        await blockchainService.getBalance(address, blockNumber, tokenAddress);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
        expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getBalance" });
      });

      it("returns the address balance for ETH", async () => {
        jest.spyOn(provider, "getBalance").mockResolvedValueOnce(ethers.BigNumber.from(15));

        const balance = await blockchainService.getBalance(address, blockNumber, tokenAddress);
        expect(balance).toStrictEqual(balance);
      });

      describe("if the call throws an error", () => {
        beforeEach(() => {
          jest
            .spyOn(provider, "getBalance")
            .mockRejectedValueOnce(new Error("RPC call error"))
            .mockRejectedValueOnce(new Error("RPC call error"))
            .mockResolvedValueOnce(balance);
        });

        it("retries RPC call with a default timeout", async () => {
          await blockchainService.getBalance(address, blockNumber, tokenAddress);
          expect(provider.getBalance).toHaveBeenCalledTimes(3);
          expect(timeoutSpy).toHaveBeenCalledTimes(2);
          expect(timeoutSpy).toHaveBeenNthCalledWith(1, defaultRetryTimeout);
          expect(timeoutSpy).toHaveBeenNthCalledWith(2, defaultRetryTimeout);
        });

        it("stops the rpc call duration metric only for the successful retry", async () => {
          await blockchainService.getBalance(address, blockNumber, tokenAddress);
          expect(stopRpcCallDurationMetricMock).toHaveBeenCalledTimes(1);
          expect(stopRpcCallDurationMetricMock).toHaveBeenCalledWith({ function: "getBalance" });
        });

        it("returns result of the successful RPC call", async () => {
          const result = await blockchainService.getBalance(address, blockNumber, tokenAddress);
          expect(result).toEqual(balance);
        });
      });

      describe("if the call throws a timeout error", () => {
        beforeEach(() => {
          jest
            .spyOn(provider, "getBalance")
            .mockRejectedValueOnce({ code: "TIMEOUT" })
            .mockRejectedValueOnce({ code: "TIMEOUT" })
            .mockResolvedValueOnce(balance);
        });

        it("retries RPC call with a quick timeout", async () => {
          await blockchainService.getBalance(address, blockNumber, tokenAddress);
          expect(timeoutSpy).toHaveBeenCalledTimes(2);
          expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
          expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
        });
      });

      describe("if the call throws a connection refused error", () => {
        beforeEach(() => {
          jest
            .spyOn(provider, "getBalance")
            .mockRejectedValueOnce({ code: "ECONNREFUSED" })
            .mockRejectedValueOnce({ code: "ECONNREFUSED" })
            .mockResolvedValueOnce(balance);
        });

        it("retries RPC call with a quick timeout", async () => {
          await blockchainService.getBalance(address, blockNumber, tokenAddress);
          expect(timeoutSpy).toHaveBeenCalledTimes(2);
          expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
          expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
        });
      });

      describe("if the call throws a connection reset error", () => {
        beforeEach(() => {
          jest
            .spyOn(provider, "getBalance")
            .mockRejectedValueOnce({ code: "ECONNRESET" })
            .mockRejectedValueOnce({ code: "ECONNRESET" })
            .mockResolvedValueOnce(balance);
        });

        it("retries RPC call with a quick timeout", async () => {
          await blockchainService.getBalance(address, blockNumber, tokenAddress);
          expect(timeoutSpy).toHaveBeenCalledTimes(2);
          expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
          expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
        });
      });

      describe("if the call throws a network error", () => {
        beforeEach(() => {
          jest
            .spyOn(provider, "getBalance")
            .mockRejectedValueOnce({ code: "NETWORK_ERROR" })
            .mockRejectedValueOnce({ code: "NETWORK_ERROR" })
            .mockResolvedValueOnce(balance);
        });

        it("retries RPC call with a quick timeout", async () => {
          await blockchainService.getBalance(address, blockNumber, tokenAddress);
          expect(timeoutSpy).toHaveBeenCalledTimes(2);
          expect(timeoutSpy).toHaveBeenNthCalledWith(1, quickRetryTimeout);
          expect(timeoutSpy).toHaveBeenNthCalledWith(2, quickRetryTimeout);
        });
      });
    });

    describe("if token address is not ETH", () => {
      beforeEach(() => {
        tokenAddress = "0x22b44df5aa1ee4542b6318ff971f183135f5e4ce";
      });

      describe("if ERC20 Contract function throws an exception", () => {
        const error = new Error("Ethers Contract error");

        beforeEach(() => {
          (RetryableContract as any as jest.Mock).mockReturnValueOnce(
            mock<RetryableContract>({
              balanceOf: jest.fn().mockImplementationOnce(() => {
                throw error;
              }),
            })
          );
        });

        it("throws an error", async () => {
          await expect(blockchainService.getBalance(address, blockNumber, tokenAddress)).rejects.toThrowError(error);
        });
      });

      describe("when there is a token with the specified address", () => {
        let balanceOfMock: jest.Mock;

        beforeEach(() => {
          balanceOfMock = jest.fn().mockResolvedValueOnce(ethers.BigNumber.from(20));
          (RetryableContract as any as jest.Mock).mockReturnValueOnce(
            mock<RetryableContract>({
              balanceOf: balanceOfMock,
            })
          );
        });

        it("uses the proper token contract", async () => {
          await blockchainService.getBalance(address, blockNumber, tokenAddress);
          expect(RetryableContract).toHaveBeenCalledTimes(1);
          expect(RetryableContract).toBeCalledWith(tokenAddress, utils.IERC20, provider);
        });

        it("gets the balance for the specified address and block", async () => {
          await blockchainService.getBalance(address, blockNumber, tokenAddress);
          expect(balanceOfMock).toHaveBeenCalledTimes(1);
          expect(balanceOfMock).toHaveBeenCalledWith(address, { blockTag });
        });

        it("returns the balance of the token", async () => {
          const balance = await blockchainService.getBalance(address, blockNumber, tokenAddress);
          expect(balance).toStrictEqual(ethers.BigNumber.from(20));
        });
      });
    });
  });

  describe("onModuleInit", () => {
    let bridgeAddresses;
    beforeEach(() => {
      bridgeAddresses = {
        erc20L1: "l1Erc20DefaultBridge",
        erc20L2: "l2Erc20DefaultBridge",
      };

      jest.spyOn(provider, "getDefaultBridgeAddresses").mockResolvedValueOnce(bridgeAddresses);
    });

    it("inits L2 ERC20 bridge address", async () => {
      await blockchainService.onModuleInit();
      expect(blockchainService.bridgeAddresses.l2Erc20DefaultBridge).toBe(bridgeAddresses.erc20L2.toLowerCase());
    });

    it("inits L1 ERC20 bridge address", async () => {
      await blockchainService.onModuleInit();
      expect(blockchainService.bridgeAddresses.l1Erc20DefaultBridge).toBe(bridgeAddresses.erc20L1.toLowerCase());
    });
  });
});
