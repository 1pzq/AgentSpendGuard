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
      "MetaMask 只能在浏览器窗口中使用"
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
    throw unknownWalletError(error, "读取当前链失败");
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
      "未找到 MetaMask请安装或启用 MetaMask 浏览器扩展"
    );
  }

  const metaMaskProvider = providerCandidates(injectedProvider).find(
    (provider) => provider.isMetaMask
  );

  if (!metaMaskProvider) {
    throw new WalletConnectionError(
      WALLET_ERROR_CODES.WALLET_NOT_METAMASK,
      "检测到钱包 provider，但不是 MetaMask"
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
        "MetaMask 连接已被拒绝",
        error
      );
    }

    throw new WalletConnectionError(
      WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR,
      providerErrorMessage(error) ?? "MetaMask 连接失败",
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
    throw unknownWalletError(error, "读取当前钱包状态失败");
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
      "MetaMask 没有切换到 Base Sepolia"
    );
  } catch (switchError) {
    if (isUserRejectedRequest(switchError)) {
      throw new WalletConnectionError(
        WALLET_ERROR_CODES.CHAIN_SWITCH_REJECTED,
        "切换到 Base Sepolia 已被拒绝",
        switchError
      );
    }

    if (!isUnrecognizedChain(switchError)) {
      throw unknownWalletError(switchError, "切换到 Base Sepolia 失败");
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
        "向 MetaMask 添加 Base Sepolia 已被拒绝",
        addError
      );
    }

    throw unknownWalletError(addError, "向 MetaMask 添加 Base Sepolia 失败");
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
        "切换到 Base Sepolia 已被拒绝",
        switchError
      );
    }

    throw unknownWalletError(switchError, "切换到 Base Sepolia 失败");
  }

  return verifyBaseSepoliaSelected(
    provider,
    "MetaMask 已添加 Base Sepolia，但没有选中该网络"
  );
}

export async function connectBaseSepoliaWallet(): Promise<BaseSepoliaWalletInfo> {
  const connectedState = await connectMetaMask();

  if (!connectedState.account) {
    throw new WalletConnectionError(
      WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR,
      "MetaMask 没有返回已连接账户"
    );
  }

  const ensuredChainId = await ensureBaseSepolia(connectedState.provider);

  const currentState = await getCurrentWalletState();
  const account = currentState.account ?? connectedState.account;

  if (currentState.chainId !== ensuredChainId) {
    throw new WalletConnectionError(
      WALLET_ERROR_CODES.UNKNOWN_WALLET_ERROR,
      "网络设置后，MetaMask 仍未处于 Base Sepolia"
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
