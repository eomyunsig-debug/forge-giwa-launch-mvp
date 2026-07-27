// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Normalized native-token AMM surface used by Forge.
/// @dev Every implementation used by the MVP returns an ERC-20 LP asset. NFT
///      positions are intentionally not advertised as supported.
interface IAMMAdapter {
    struct LiquidityPosition {
        address pool;
        address asset;
        uint256 positionId;
        uint256 principal;
    }

    struct PoolState {
        address pool;
        uint256 tokenReserve;
        uint256 nativeReserve;
        uint256 totalLiquidity;
        bool initialized;
    }

    function adapterId() external pure returns (bytes32);
    function isTestOnly() external pure returns (bool);
    function isConfigured() external view returns (bool);

    function createPool(address token) external returns (address pool);

    function addInitialLiquidity(
        address token,
        uint256 tokenAmount,
        uint256 minLiquidity,
        uint256 deadline,
        address lpRecipient
    ) external payable returns (LiquidityPosition memory position);

    /// @param nativeToToken True for native -> launch token; false for launch token -> native.
    function quoteExactInput(address token, bool nativeToToken, uint256 amountIn)
        external
        view
        returns (uint256 amountOut);

    /// @return amountIn The input required for the requested exact output.
    function quoteExactOutput(address token, bool nativeToToken, uint256 amountOut)
        external
        view
        returns (uint256 amountIn);

    function buy(address token, uint256 minTokenOut, uint256 deadline, address recipient)
        external
        payable
        returns (uint256 tokenOut);

    function sell(
        address token,
        uint256 tokenIn,
        uint256 minNativeOut,
        uint256 deadline,
        address recipient
    ) external returns (uint256 nativeOut);

    function liquidityPosition(address token)
        external
        view
        returns (LiquidityPosition memory position);

    function getPoolState(address token) external view returns (PoolState memory state);
}
