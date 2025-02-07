export type NetworkConfig = {
  name: string;
  icon: string;
  verificationApiUrl: string;
  apiUrl: string;
  newProverUrl: string;
  rpcUrl: string;
  bridgeUrl?: string;
  l2NetworkName: string;
  l2WalletUrl: string;
  l2ChainId: 270 | 280 | 324;
  l1ExplorerUrl: string;
  maintenance: boolean;
  published: boolean;
  hostnames: string[];
};

export type EnvironmentConfig = {
  networks: NetworkConfig[];
};
