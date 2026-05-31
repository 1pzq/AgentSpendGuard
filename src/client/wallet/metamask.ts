import { baseSepoliaWalletChain } from "@/shared/chain";
import type { PublicWalletChainConfig, WalletInfo } from "@/shared/types";

export const WALLET_ERROR_CODES = {
  WALLET_NOT_FOUND: "WALLET_NOT_FOUND",
  WALLET_NOT_METAMASK: "WALLET_NOT_METAMASK",
  USER_REJECTED: "USER_REJECTED",
  CHAIN_SWITCH_REJECTED: "CHAIN_SWITCH_REJECTED",
  CHAIN_ADD_REJECTED: "CHAIN_ADD_REJECTED",
  UNKNOWN_WALLET_ERROR: "UNKNOWN_WALLET_ERROR"
} as const;

export type WalletErrorCode =
  (typeof WALLET_ERROR_CODES)[keyof typeof WALLET_ERROR_CODES];

export type EthereumRequestArguments = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export type EthereumProvider = {
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
  on?(
    eventName: "accountsChanged" | "chainChanged" | "disconnect",
    listener: (...args: unknown[]) => void
  ): void;
  removeListener?(
    eventName: "accountsChanged" | "chainChanged" | "disconnect",
    listener: (...args: unknown[]) => void
  ): void;
  request<T = unknown>(args: EthereumRequestArguments): Promise<T>;
};

export type WalletState = {
  provider: EthereumProvider;
  account: string | null;
  chainId: string | null;
  isConnected: boolean;
};

export type BaseSepoliaWalletInfo = WalletInfo & {
  account: string;
  chainId: string;
  chainKey: PublicWalletChainConfig["key"];
  chainName: PublicWalletChainConfig["name"];
};

export class WalletConnectionError extends Error {
  readonly code: WalletErrorCode;
  readonly cause?: unknown;

  constructor(code: WalletErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "WalletConnectionError";
    this.code = code;
    this.cause = cause;
  }
}

type EthereumWindow = Window & {
  ethereum?: EthereumProvider;
};

type ProviderErrorLike = {
  code?: unknown;
  message?: unknown;
};

function walletErrorCode(error: unknown): number | string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as ProviderErrorLike).code;
  return typeof code === "number" || typeof code === "string" ? code : null;
}

function isUserRejectedRequest(error: unknown) {
  const code = walletErrorCode(error);
  return code === 4001 || code === "4001";
}

function isUnrecognizedChain(error: unknown) {
  const code = walletErrorCode(error);
  return code === 4902 || code === "4902";
}

function providerErrorMessage(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return null;
  }

  const message = (error as ProviderErrorLike).message;
  return typeof message === "string" ? message : null;
}

function normalizeAccounts(accounts: unknown): string[] {
  if (!Array.isArray(accounts)) return [];

  return accounts.filter((account): account is string => typeof account === "string");
}

function normalizeChainId(chainId: unknown): string | null {
  return typeof chainId === "string" ? chainId : null;
}

function requireBrowserWindow(): EthereumWindow {
  if (typeof window === "undefined") {
    throw new WalletConnectionError(
      WALLET_ERROR_CODES.WALLET_NOT_FOUND,
      "MetaMask is only available in a browser window."
    );
  }

  return window as EthereumWindow;
}

function chainParams(chain: PublicWalletChainConfig) {
  return {
    chainId: chain.hexId,
    chainName: chain.name,
    rpcUrls: [...chain.rpcUrls],
    blockExplorerUrls: [...chain.blockExplorerUrls],
    nativeCurrency: { ...chain.nativeCurrency }
  };
}

function providerCandidates(provider: EthereumProvider) {
  const nestedProviders = Array.isArray(provider.providers) ? provider.providers : [];
  return [provider, ...nestedProviders].filter(
    (candidate, index, candidates) => candidates.indexOf(candidate) === index
  );
}

function unknownWalletError(error: unknown, fallbackMessage: string) {
  return new WalletConnectionError(
    WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR,
    providerErrorMessage(error) ?? fallbackMessage,
    error
  );
}

async function readProviderChainId(provider: EthereumProvider): Promise<string | null> {
  try {
    return normalizeChainId(await provider.request({ method: "eth_chainId" }));
  } catch (error) {
    throw unknownWalletError(error, "Reading the current chain failed.");
  }
}

async function verifyBaseSepoliaSelected(
  provider: EthereumProvider,
  failureMessage: string
): Promise<string> {
  const chainId = await readProviderChainId(provider);

  if (chainId === baseSepoliaWalletChain.hexId) {
    return baseSepoliaWalletChain.hexId;
  }

  throw new WalletConnectionError(
    WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR,
    failureMessage
  );
}

export function detectMetaMaskProvider(): EthereumProvider {
  const injectedProvider = requireBrowserWindow().ethereum;

  if (!injectedProvider) {
    throw new WalletConnectionError(
      WALLET_ERROR_CODES.WALLET_NOT_FOUND,
      "MetaMask was not found. Install or enable the MetaMask browser extension."
    );
  }

  const metaMaskProvider = providerCandidates(injectedProvider).find(
    (provider) => provider.isMetaMask
  );

  if (!metaMaskProvider) {
    throw new WalletConnectionError(
      WALLET_ERROR_CODES.WALLET_NOT_METAMASK,
      "A wallet provider was found, but it is not MetaMask."
    );
  }

  return metaMaskProvider;
}

export async function connectMetaMask(): Promise<WalletState> {
  const provider = detectMetaMaskProvider();

  try {
    const accounts = normalizeAccounts(
      await provider.request({ method: "eth_requestAccounts" })
    );
    const chainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));

    return {
      provider,
      account: accounts[0] ?? null,
      chainId,
      isConnected: accounts.length > 0
    };
  } catch (error) {
    if (isUserRejectedRequest(error)) {
      throw new WalletConnectionError(
        WALLET_ERROR_CODES.USER_REJECTED,
        "MetaMask connection was rejected.",
        error
      );
    }

    throw new WalletConnectionError(
      WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR,
      providerErrorMessage(error) ?? "MetaMask connection failed.",
      error
    );
  }
}

export async function getCurrentWalletState(): Promise<WalletState> {
  const provider = detectMetaMaskProvider();

  try {
    const accounts = normalizeAccounts(
      await provider.request({ method: "eth_accounts" })
    );
    const chainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));

    return {
      provider,
      account: accounts[0] ?? null,
      chainId,
      isConnected: accounts.length > 0
    };
  } catch (error) {
    throw unknownWalletError(error, "Reading the current wallet state failed.");
  }
}

export async function ensureBaseSepolia(
  provider: EthereumProvider = detectMetaMaskProvider()
): Promise<string> {
  const currentChainId = await readProviderChainId(provider);

  if (currentChainId === baseSepoliaWalletChain.hexId) {
    return baseSepoliaWalletChain.hexId;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: baseSepoliaWalletChain.hexId }]
    });

    return verifyBaseSepoliaSelected(
      provider,
      "MetaMask did not switch to Base Sepolia."
    );
  } catch (switchError) {
    if (isUserRejectedRequest(switchError)) {
      throw new WalletConnectionError(
        WALLET_ERROR_CODES.CHAIN_SWITCH_REJECTED,
        "Switching to Base Sepolia was rejected.",
        switchError
      );
    }

    if (!isUnrecognizedChain(switchError)) {
      throw unknownWalletError(switchError, "Switching to Base Sepolia failed.");
    }
  }

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [chainParams(baseSepoliaWalletChain)]
    });
  } catch (addError) {
    if (isUserRejectedRequest(addError)) {
      throw new WalletConnectionError(
        WALLET_ERROR_CODES.CHAIN_ADD_REJECTED,
        "Adding Base Sepolia to MetaMask was rejected.",
        addError
      );
    }

    throw unknownWalletError(addError, "Adding Base Sepolia to MetaMask failed.");
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: baseSepoliaWalletChain.hexId }]
    });
  } catch (switchError) {
    if (isUserRejectedRequest(switchError)) {
      throw new WalletConnectionError(
        WALLET_ERROR_CODES.CHAIN_SWITCH_REJECTED,
        "Switching to Base Sepolia was rejected.",
        switchError
      );
    }

    throw unknownWalletError(switchError, "Switching to Base Sepolia failed.");
  }

  return verifyBaseSepoliaSelected(
    provider,
    "MetaMask added Base Sepolia but did not select it."
  );
}

export async function connectBaseSepoliaWallet(): Promise<BaseSepoliaWalletInfo> {
  const connectedState = await connectMetaMask();

  if (!connectedState.account) {
    throw new WalletConnectionError(
      WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR,
      "MetaMask did not return a connected account."
    );
  }

  const ensuredChainId = await ensureBaseSepolia(connectedState.provider);

  const currentState = await getCurrentWalletState();
  const account = currentState.account ?? connectedState.account;

  if (currentState.chainId !== ensuredChainId) {
    throw new WalletConnectionError(
      WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR,
      "MetaMask is not on Base Sepolia after network setup."
    );
  }

  return {
    eoa: account,
    smartAccount: null,
    chain: baseSepoliaWalletChain.name,
    account,
    chainId: currentState.chainId,
    chainKey: baseSepoliaWalletChain.key,
    chainName: baseSepoliaWalletChain.name
  };
}
