import { Entity, Column, PrimaryColumn, Check, Index, JoinColumn, ManyToOne } from "typeorm";
import { Block } from "./block.entity";
import { Transaction } from "./transaction.entity";
import { bigIntNumberTransformer } from "../transformers/bigIntNumber.transformer";
import { hexTransformer } from "../transformers/hex.transformer";
import { BaseEntity } from "./base.entity";

@Entity({ name: "tokens" })
@Check(`"symbol" <> ''`)
@Index(["blockNumber", "logIndex"])
export class Token extends BaseEntity {
  @PrimaryColumn({ type: "bytea", transformer: hexTransformer })
  public readonly l2Address: string;

  @Column({ type: "bytea", nullable: true, transformer: hexTransformer })
  public readonly l1Address?: string;

  @Column({ generated: true, type: "bigint" })
  public readonly number: number;

  @Column()
  public readonly symbol: string;

  @Column()
  public readonly name?: string;

  @Column()
  public readonly decimals: number;

  @ManyToOne(() => Block, { onDelete: "CASCADE" })
  @JoinColumn({ name: "blockNumber" })
  private readonly _block: never;

  @Column({ type: "bigint", transformer: bigIntNumberTransformer })
  public readonly blockNumber: number;

  @ManyToOne(() => Transaction)
  @JoinColumn({ name: "transactionHash" })
  private readonly _transaction: never;

  @Index()
  @Column({ type: "bytea", transformer: hexTransformer })
  public readonly transactionHash: string;

  @Column({ type: "int" })
  public readonly logIndex: number;
}
