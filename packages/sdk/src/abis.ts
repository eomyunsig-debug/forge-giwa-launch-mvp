import { parseAbi } from "viem";

export const launchFactoryAbi = parseAbi([
  "function launch((string name,string symbol,string metadataURI,bytes32 metadataHash,uint16 creatorAllocationBps,uint256 initialNativeLiquidity,uint256 minLiquidityTokens,uint256 deadline,address adapter) request) payable returns (uint256 launchId,(address token,address creator,address vestingVault,address liquidityLocker,address adapter,address pool,address lpAsset,uint256 lpPositionId,uint256 lpPrincipal,uint256 creatorAllocation,uint256 initialTokenLiquidity,uint256 initialNativeLiquidity,uint256 creationFeePaid,uint16 creatorAllocationBps,uint48 createdAt,bytes32 metadataHash) record)",
  "function config() view returns (address)",
  "function launchCount() view returns (uint256)",
  "function launchIdByToken(address token) view returns (uint256)",
  "event LaunchCreated(uint256 indexed launchId,address indexed token,address indexed creator,address vestingVault,address liquidityLocker,address adapter,address pool,address lpAsset,uint256 lpPositionId,uint256 lpPrincipal,uint16 creatorAllocationBps,uint256 creatorAllocation,uint256 initialTokenLiquidity,uint256 initialNativeLiquidity,uint256 creationFeePaid,bytes32 metadataHash,string metadataURI)",
]);

export const protocolConfigAbi = parseAbi([
  "function admin() view returns (address)",
  "function feeRecipient() view returns (address)",
  "function creationFee() view returns (uint256)",
  "function minimumInitialLiquidity() view returns (uint256)",
  "function adapterEnabled(address adapter) view returns (bool)",
  "function standardTotalSupply() pure returns (uint256)",
  "function maxCreatorAllocationBps() pure returns (uint16)",
  "function creatorCliff() pure returns (uint48)",
  "function creatorVestingDuration() pure returns (uint48)",
]);

export const ammAdapterAbi = parseAbi([
  "function adapterId() pure returns (bytes32)",
  "function isTestOnly() pure returns (bool)",
  "function isConfigured() view returns (bool)",
  "function quoteExactInput(address token,bool nativeToToken,uint256 amountIn) view returns (uint256 amountOut)",
  "function quoteExactOutput(address token,bool nativeToToken,uint256 amountOut) view returns (uint256 amountIn)",
  "function buy(address token,uint256 minTokenOut,uint256 deadline,address recipient) payable returns (uint256 tokenOut)",
  "function sell(address token,uint256 tokenIn,uint256 minNativeOut,uint256 deadline,address recipient) returns (uint256 nativeOut)",
  "function getPoolState(address token) view returns ((address pool,uint256 tokenReserve,uint256 nativeReserve,uint256 totalLiquidity,bool initialized) state)",
]);

export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

export const vestingVaultAbi = parseAbi([
  "function creator() view returns (address)",
  "function totalAllocation() view returns (uint256)",
  "function released() view returns (uint256)",
  "function cliff() view returns (uint48)",
  "function end() view returns (uint48)",
  "function claimable() view returns (uint256)",
  "function lockedAmount() view returns (uint256)",
  "function claim() returns (uint256 amount)",
]);
