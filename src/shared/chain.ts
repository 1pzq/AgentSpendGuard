import type { PublicWalletChainConfig } from "@/shared/types";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_CHAIN_HEX_ID = "0x14a34";
export const BASE_SEPOLIA_CHAIN_KEY = "base-sepolia";
export const BASE_SEPOLIA_CHAIN_NAME = "Base Sepolia";
export const BASE_SEPOLIA_EXPLORER_URL = "https://sepolia.basescan.org";
export const BASE_SEPOLIA_PUBLIC_RPC_URL = "https://sepolia.base.org";

export const BASE_SEPOLIA_USDC = {
  symbol: "USDC",
  decimals: 6,
  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
} as const;

export const baseSepoliaWalletChain = {
  id: BASE_SEPOLIA_CHAIN_ID,
  hexId: BASE_SEPOLIA_CHAIN_HEX_ID,
  key: BASE_SEPOLIA_CHAIN_KEY,
  name: BASE_SEPOLIA_CHAIN_NAME,
  rpcUrls: [BASE_SEPOLIA_PUBLIC_RPC_URL],
  blockExplorerUrls: [BASE_SEPOLIA_EXPLORER_URL],
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18
  }
} as const satisfies PublicWalletChainConfig;
