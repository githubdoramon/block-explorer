import { Entity, Column, Index, ManyToOne, JoinColumn, PrimaryColumn } from "typeorm";
import { BaseEntity } from "../common/entities/base.entity";
import { Token } from "../token/token.entity";
import { normalizeAddressTransformer } from "../common/transformers/normalizeAddress.transformer";
import { bigIntNumberTransformer } from "../common/transformers/bigIntNumber.transformer";
import { hexTransformer } from "../common/transformers/hex.transformer";
import { Transaction } from "../transaction/entities/transaction.entity";

export enum TransferType {
  Deposit = "deposit",
  Transfer = "transfer",
  Withdrawal = "withdrawal",
  Fee = "fee",
  Mint = "mint",
  Refund = "refund",
}

@Entity({ name: "transfers" })
@Index(["blockNumber", "logIndex"])
@Index(["transactionHash", "timestamp", "logIndex"])
@Index(["tokenAddress", "isFeeOrRefund", "timestamp", "logIndex"])
@Index(["tokenAddress", "fields", "blockNumber", "logIndex"])
export class Transfer extends BaseEntity {
  @PrimaryColumn({ generated: true, type: "bigint", select: false })
  public number: number;

  @Index()
  @Column({ type: "bytea", transformer: normalizeAddressTransformer })
  public readonly from: string;

  @Index()
  @Column({ type: "bytea", transformer: normalizeAddressTransformer })
  public readonly to: string;

  @Column({ type: "bigint", transformer: bigIntNumberTransformer })
  public readonly blockNumber: number;

  @ManyToOne(() => Transaction)
  @JoinColumn({ name: "transactionHash" })
  public readonly transaction?: Transaction;

  @Index()
  @Column({ type: "bytea", nullable: true, transformer: hexTransformer })
  public readonly transactionHash?: string;

  @Column({ type: "int", select: false })
  public readonly transactionIndex: number;

  @Index()
  @Column({ type: "timestamp" })
  public readonly timestamp: Date;

  @Column({ type: "varchar", length: 128, nullable: true })
  public readonly amount?: string;

  @ManyToOne(() => Token)
  @JoinColumn({ name: "tokenAddress" })
  public readonly token?: Token;

  @Index()
  @Column({ type: "bytea", transformer: normalizeAddressTransformer })
  public readonly tokenAddress: string;

  @Column({ type: "enum", enum: TransferType, default: TransferType.Transfer })
  public readonly type: TransferType;

  @Column({ type: "boolean", select: false })
  public readonly isFeeOrRefund: boolean;

  @Column({ type: "int", select: false })
  public readonly logIndex: number;

  @Column({ type: "jsonb", nullable: true })
  public readonly fields?: Record<string, string>;

  @Column({ type: "boolean", default: false })
  public readonly isInternal: boolean;

  toJSON() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { number, ...restFields } = this;
    return restFields;
  }
}
