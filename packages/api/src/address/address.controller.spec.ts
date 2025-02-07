import { Test, TestingModule } from "@nestjs/testing";
import { mock } from "jest-mock-extended";
import { Pagination } from "nestjs-typeorm-paginate";
import { AddressController } from "./address.controller";
import { AddressService } from "./address.service";
import { BalanceService } from "../balance/balance.service";
import { BlockService } from "../block/block.service";
import { LogService } from "../log/log.service";
import { TransactionService } from "../transaction/transaction.service";
import { TransactionReceiptService } from "../transaction/transactionReceipt.service";
import { TransactionReceipt } from "../transaction/entities/transactionReceipt.entity";
import { Log } from "../log/log.entity";
import { Token } from "../token/token.entity";
import { PagingOptionsWithMaxItemsLimitDto } from "../common/dtos";
import { AddressType } from "./dtos/baseAddress.dto";
import { TransferService } from "../transfer/transfer.service";
import { Transfer } from "../transfer/transfer.entity";

jest.mock("../common/utils", () => ({
  ...jest.requireActual("../common/utils"),
  buildDateFilter: jest.fn().mockReturnValue({ timestamp: "timestamp" }),
}));

describe("AddressController", () => {
  let controller: AddressController;
  let serviceMock: AddressService;
  let blockServiceMock: BlockService;
  let logServiceMock: LogService;
  let balanceServiceMock: BalanceService;
  let transactionServiceMock: TransactionService;
  let transactionReceiptServiceMock: TransactionReceiptService;
  let transferServiceMock: TransferService;
  const blockchainAddress = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
  const normalizedAddress = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF";
  const pagingOptions: PagingOptionsWithMaxItemsLimitDto = { limit: 10, page: 2, maxLimit: 10000 };

  beforeEach(async () => {
    serviceMock = mock<AddressService>();
    blockServiceMock = mock<BlockService>();
    transactionServiceMock = mock<TransactionService>();
    transactionReceiptServiceMock = mock<TransactionReceiptService>();
    logServiceMock = mock<LogService>();
    balanceServiceMock = mock<BalanceService>();
    transferServiceMock = mock<TransferService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressController],
      providers: [
        {
          provide: AddressService,
          useValue: serviceMock,
        },
        {
          provide: BlockService,
          useValue: blockServiceMock,
        },
        {
          provide: TransactionService,
          useValue: transactionServiceMock,
        },
        {
          provide: TransactionReceiptService,
          useValue: transactionReceiptServiceMock,
        },
        {
          provide: LogService,
          useValue: logServiceMock,
        },
        {
          provide: BalanceService,
          useValue: balanceServiceMock,
        },
        {
          provide: TransferService,
          useValue: transferServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AddressController>(AddressController);
  });

  describe("getAddress", () => {
    let addressRecord;

    beforeEach(() => {
      (balanceServiceMock.getBalances as jest.Mock).mockResolvedValue({
        blockNumber: 0,
        balances: {},
      });
    });

    it("queries addresses by specified address", async () => {
      await controller.getAddress(blockchainAddress);
      expect(serviceMock.findOne).toHaveBeenCalledTimes(1);
      expect(serviceMock.findOne).toHaveBeenCalledWith(blockchainAddress);
    });

    it("queries address balances", async () => {
      await controller.getAddress(blockchainAddress);
      expect(balanceServiceMock.getBalances).toHaveBeenCalledTimes(1);
      expect(balanceServiceMock.getBalances).toHaveBeenCalledWith(blockchainAddress);
    });

    describe("when contract address exists", () => {
      const transactionHash = "transactionHash";
      const transactionFrom = "transactionFrom";
      const totalTxCount = 20;
      let transactionReceipt;
      const addressBalances = {
        balances: {
          "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF": {
            balance: "10",
            token: mock<Token>({ l2Address: "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF" }),
          },
          "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFA": {
            balance: "20",
            token: mock<Token>({ l2Address: "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFA" }),
          },
        },
        blockNumber: 30,
      };

      beforeEach(() => {
        addressRecord = {
          address: "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
          blockNumber: 20,
          bytecode: "0x123",
          createdInBlockNumber: 30,
          creatorTxHash: transactionHash,
          creatorAddress: transactionFrom,
        };
        transactionReceipt = mock<TransactionReceipt>({ from: transactionFrom });
        (serviceMock.findOne as jest.Mock).mockResolvedValue(addressRecord);
        (transactionReceiptServiceMock.findOne as jest.Mock).mockResolvedValue(transactionReceipt);
        (transactionServiceMock.count as jest.Mock).mockResolvedValue(totalTxCount);
        (balanceServiceMock.getBalances as jest.Mock).mockResolvedValue(addressBalances);
      });

      it("queries creatorAddress value from transaction receipt", async () => {
        await controller.getAddress(blockchainAddress);
        expect(transactionReceiptServiceMock.findOne).toHaveBeenCalledTimes(1);
        expect(transactionReceiptServiceMock.findOne).toHaveBeenCalledWith(transactionHash, ["from"]);
      });

      it("queries totalTransactions value from transaction receipt repo with formatted contractAddress", async () => {
        await controller.getAddress(blockchainAddress);
        expect(transactionServiceMock.count).toHaveBeenCalledTimes(1);
        expect(transactionServiceMock.count).toHaveBeenCalledWith({
          "from|to": "0xffffffffffffffffffffffffffffffffffffffff",
        });
      });

      it("returns the contract address record", async () => {
        const result = await controller.getAddress(blockchainAddress);
        expect(result).toStrictEqual({
          type: AddressType.Contract,
          ...addressRecord,
          blockNumber: addressBalances.blockNumber,
          balances: addressBalances.balances,
          totalTransactions: totalTxCount,
        });
      });

      describe("when there are no balances for the contract", () => {
        const defaultBalancesResponse = {
          balances: {},
          blockNumber: 0,
        };

        beforeEach(() => {
          (balanceServiceMock.getBalances as jest.Mock).mockResolvedValue(defaultBalancesResponse);
        });

        it("returns the contract address record with empty balances and block number from the address record", async () => {
          const result = await controller.getAddress(blockchainAddress);
          expect(result).toStrictEqual({
            type: AddressType.Contract,
            ...addressRecord,
            blockNumber: addressRecord.createdInBlockNumber,
            balances: defaultBalancesResponse.balances,
            totalTransactions: totalTxCount,
          });
        });
      });
    });

    describe("when address balances exist", () => {
      const sealedNonce = 10;
      const verifiedNonce = 10;
      const addressBalances = {
        balances: {
          "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF": {
            balance: "10",
            token: mock<Token>({ l2Address: "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF" }),
          },
          "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFA": {
            balance: "20",
            token: mock<Token>({ l2Address: "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFA" }),
          },
        },
        blockNumber: 30,
      };
      beforeEach(() => {
        (serviceMock.findOne as jest.Mock).mockResolvedValue(null);
        (transactionServiceMock.getAccountNonce as jest.Mock)
          .mockResolvedValueOnce(sealedNonce)
          .mockResolvedValueOnce(verifiedNonce);
        (balanceServiceMock.getBalances as jest.Mock).mockResolvedValue(addressBalances);
      });

      it("queries account sealed and verified nonce", async () => {
        await controller.getAddress(blockchainAddress);
        expect(transactionServiceMock.getAccountNonce).toHaveBeenCalledTimes(2);
        expect(transactionServiceMock.getAccountNonce).toHaveBeenCalledWith({ accountAddress: blockchainAddress });
        expect(transactionServiceMock.getAccountNonce).toHaveBeenCalledWith({
          accountAddress: blockchainAddress,
          isVerified: true,
        });
      });

      it("queries account balances", async () => {
        await controller.getAddress(blockchainAddress);
        expect(balanceServiceMock.getBalances).toHaveBeenCalledTimes(1);
        expect(balanceServiceMock.getBalances).toHaveBeenCalledWith(blockchainAddress);
      });

      it("returns the account address record", async () => {
        const result = await controller.getAddress(blockchainAddress);
        expect(result).toStrictEqual({
          type: AddressType.Account,
          address: normalizedAddress,
          blockNumber: addressBalances.blockNumber,
          balances: addressBalances.balances,
          sealedNonce,
          verifiedNonce,
        });
      });
    });

    describe("when balances do not exist", () => {
      const blockNumber = 10;
      beforeEach(() => {
        (serviceMock.findOne as jest.Mock).mockResolvedValueOnce(null);
        (blockServiceMock.getLastBlockNumber as jest.Mock).mockResolvedValueOnce(blockNumber);
        (balanceServiceMock.getBalances as jest.Mock).mockResolvedValue({
          blockNumber: 0,
          balances: {},
        });
      });

      it("returns the default account address response", async () => {
        const result = await controller.getAddress(blockchainAddress);
        expect(result).toStrictEqual({
          type: AddressType.Account,
          address: normalizedAddress,
          blockNumber,
          balances: {},
          sealedNonce: 0,
          verifiedNonce: 0,
        });
      });
    });
  });

  describe("getAddressLogs", () => {
    const transactionLogs = mock<Pagination<Log>>();
    const address = "address";
    describe("when address exists", () => {
      beforeEach(() => {
        (logServiceMock.findAll as jest.Mock).mockResolvedValueOnce(transactionLogs);
      });

      it("queries addresses with the specified options", async () => {
        await controller.getAddressLogs(address, pagingOptions);
        expect(logServiceMock.findAll).toHaveBeenCalledTimes(1);
        expect(logServiceMock.findAll).toHaveBeenCalledWith(
          { address },
          {
            ...pagingOptions,
            route: `address/${address}/logs`,
          }
        );
      });

      it("returns address logs", async () => {
        const result = await controller.getAddressLogs(address, pagingOptions);
        expect(result).toBe(transactionLogs);
      });
    });
  });

  describe("getAddressTransfers", () => {
    const transfers = mock<Pagination<Transfer>>();
    const address = "address";
    const listFilterOptions = {
      fromDate: "2023-02-08T15:34:46.251Z",
      toDate: "2023-02-08T17:34:46.251Z",
    };
    const pagingOptions: PagingOptionsWithMaxItemsLimitDto = { limit: 10, page: 2, maxLimit: 10000 };

    beforeEach(() => {
      (transferServiceMock.findAll as jest.Mock).mockResolvedValueOnce(transfers);
    });

    it("queries transfers with the specified options", async () => {
      await controller.getAddressTransfers(address, listFilterOptions, pagingOptions);
      expect(transferServiceMock.findAll).toHaveBeenCalledTimes(1);
      expect(transferServiceMock.findAll).toHaveBeenCalledWith(
        {
          address,
          isFeeOrRefund: false,
          timestamp: "timestamp",
        },
        {
          filterOptions: listFilterOptions,
          ...pagingOptions,
          route: `address/${address}/transfers`,
        }
      );
    });

    it("returns the transfers", async () => {
      const result = await controller.getAddressTransfers(address, listFilterOptions, pagingOptions);
      expect(result).toBe(transfers);
    });
  });
});
