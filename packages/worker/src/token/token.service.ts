import { types } from "zksync-web3";
import { Injectable, Logger } from "@nestjs/common";
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { utils as ethersUtils } from "ethers";
import { Histogram } from "prom-client";
import { LogType, isLogOfType } from "../log/logType";
import { BlockchainService } from "../blockchain/blockchain.service";
import { TokenRepository } from "../repositories";
import { GET_TOKEN_INFO_DURATION_METRIC_NAME } from "../metrics";
import { ContractAddress } from "../address/interface/contractAddress.interface";
import parseLog from "../utils/parseLog";
import { CONTRACT_INTERFACES } from "../constants";

export interface Token {
  l2Address: string;
  l1Address: string;
  symbol: string;
  decimals: number;
  name: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

@Injectable()
export class TokenService {
  private readonly logger: Logger;
  private readonly abiCoder: ethersUtils.AbiCoder;

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly tokenRepository: TokenRepository,
    @InjectMetric(GET_TOKEN_INFO_DURATION_METRIC_NAME)
    private readonly getTokenInfoDurationMetric: Histogram
  ) {
    this.abiCoder = new ethersUtils.AbiCoder();
    this.logger = new Logger(TokenService.name);
  }

  private async getERC20Token(contractAddress: string): Promise<{
    symbol: string;
    decimals: number;
    name: string;
  }> {
    try {
      return await this.blockchainService.getERC20TokenData(contractAddress);
    } catch {
      this.logger.log({
        message: "Cannot parse ERC20 contract. Might be a token of a different type.",
        contractAddress,
      });
      return null;
    }
  }

  public async saveERC20Token(
    contractAddress: ContractAddress,
    transactionReceipt: types.TransactionReceipt
  ): Promise<void> {
    let erc20Token: {
      symbol: string;
      decimals: number;
      name: string;
      l1Address?: string;
    };

    const bridgeLog = transactionReceipt.logs?.find(
      (log) =>
        isLogOfType(log, [LogType.BridgeInitialization, LogType.BridgeInitialize]) &&
        log.address.toLowerCase() === contractAddress.address.toLowerCase()
    );

    if (bridgeLog) {
      const parsedLog = parseLog(CONTRACT_INTERFACES.L2_STANDARD_ERC20, bridgeLog);
      erc20Token = {
        name: parsedLog.args.name,
        symbol: parsedLog.args.symbol,
        decimals: parsedLog.args.decimals,
        l1Address: parsedLog.args.l1Token,
      };
    } else {
      const stopGetTokenInfoDurationMetric = this.getTokenInfoDurationMetric.startTimer();
      erc20Token = await this.getERC20Token(contractAddress.address);
      if (erc20Token) {
        stopGetTokenInfoDurationMetric();
      }
    }

    if (erc20Token?.symbol) {
      this.logger.debug({
        message: "Adding ERC20 token to the DB",
        blockNumber: contractAddress.blockNumber,
        transactionHash: contractAddress.transactionHash,
        tokenAddress: contractAddress.address,
      });

      await this.tokenRepository.upsert({
        ...erc20Token,
        blockNumber: contractAddress.blockNumber,
        transactionHash: contractAddress.transactionHash,
        l2Address: contractAddress.address,
        logIndex: contractAddress.logIndex,
      });
    }
  }
}
