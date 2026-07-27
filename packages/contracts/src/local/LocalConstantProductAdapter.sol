// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IAMMAdapter } from "../interfaces/IAMMAdapter.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
import { SafeERC20 } from "../lib/SafeERC20.sol";
import { LocalConstantProductPool } from "./LocalConstantProductPool.sol";

/// @notice Deterministic local Anvil AMM adapter. NEVER use as a GIWA deployment.
contract LocalConstantProductAdapter is IAMMAdapter {
    using SafeERC20 for IERC20;

    uint256 internal constant LOCAL_ANVIL_CHAIN_ID = 31_337;

    error ZeroAddress();
    error AddressHasNoCode(address target);
    error PoolDoesNotExist(address token);
    error InvalidAmount();
    error DeadlineExpired(uint256 deadline, uint256 currentTimestamp);
    error InsufficientLiquidityMinted(uint256 minimum, uint256 actual);
    error TokenTransferMismatch(uint256 expected, uint256 actual);
    error DirectNativeTransferForbidden();
    error UnsupportedLocalChain(uint256 actualChainId);

    mapping(address token => address pool) public poolFor;

    event LocalPoolCreated(address indexed token, address indexed pool, bytes32 indexed salt);

    constructor() {
        if (block.chainid != LOCAL_ANVIL_CHAIN_ID) {
            revert UnsupportedLocalChain(block.chainid);
        }
    }

    function adapterId() external pure returns (bytes32) {
        return keccak256("FORGE_LOCAL_CONSTANT_PRODUCT_TEST_ONLY_V1");
    }

    function isTestOnly() external pure returns (bool) {
        return true;
    }

    function isConfigured() external pure returns (bool) {
        return true;
    }

    function createPool(address token) public returns (address pool) {
        if (token == address(0)) revert ZeroAddress();
        if (token.code.length == 0) revert AddressHasNoCode(token);

        pool = poolFor[token];
        if (pool != address(0)) return pool;

        bytes32 salt = _salt(token);
        pool = address(new LocalConstantProductPool{ salt: salt }(IERC20(token), address(this)));
        poolFor[token] = pool;
        emit LocalPoolCreated(token, pool, salt);
    }

    function computePoolAddress(address token) external view returns (address predicted) {
        bytes32 bytecodeHash = keccak256(
            abi.encodePacked(
                type(LocalConstantProductPool).creationCode,
                abi.encode(IERC20(token), address(this))
            )
        );
        predicted = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), _salt(token), bytecodeHash)
                    )
                )
            )
        );
    }

    function addInitialLiquidity(
        address token,
        uint256 tokenAmount,
        uint256 minLiquidity,
        uint256 deadline,
        address lpRecipient
    ) external payable returns (LiquidityPosition memory position) {
        _checkDeadline(deadline);
        if (lpRecipient == address(0)) revert ZeroAddress();
        if (tokenAmount == 0 || msg.value == 0) revert InvalidAmount();

        address pool = poolFor[token];
        if (pool == address(0)) revert PoolDoesNotExist(token);

        uint256 balanceBefore = IERC20(token).balanceOf(pool);
        IERC20(token).safeTransferFrom(msg.sender, pool, tokenAmount);
        uint256 received = IERC20(token).balanceOf(pool) - balanceBefore;
        if (received != tokenAmount) revert TokenTransferMismatch(tokenAmount, received);

        uint256 liquidity = LocalConstantProductPool(payable(pool)).initialize{ value: msg.value }(
            tokenAmount, lpRecipient
        );
        if (liquidity < minLiquidity) {
            revert InsufficientLiquidityMinted(minLiquidity, liquidity);
        }

        position = LiquidityPosition({
            pool: pool, asset: pool, positionId: uint256(uint160(pool)), principal: liquidity
        });
    }

    function quoteExactInput(address token, bool nativeToToken, uint256 amountIn)
        external
        view
        returns (uint256 amountOut)
    {
        return _pool(token).quoteExactInput(nativeToToken, amountIn);
    }

    function quoteExactOutput(address token, bool nativeToToken, uint256 amountOut)
        external
        view
        returns (uint256 amountIn)
    {
        return _pool(token).quoteExactOutput(nativeToToken, amountOut);
    }

    function buy(address token, uint256 minTokenOut, uint256 deadline, address recipient)
        external
        payable
        returns (uint256 tokenOut)
    {
        _checkDeadline(deadline);
        if (msg.value == 0) revert InvalidAmount();
        tokenOut = _pool(token).swapExactNativeForTokens{ value: msg.value }(minTokenOut, recipient);
    }

    function sell(
        address token,
        uint256 tokenIn,
        uint256 minNativeOut,
        uint256 deadline,
        address recipient
    ) external returns (uint256 nativeOut) {
        _checkDeadline(deadline);
        if (tokenIn == 0) revert InvalidAmount();

        LocalConstantProductPool pool = _pool(token);
        pool.sync();
        uint256 balanceBefore = IERC20(token).balanceOf(address(pool));
        IERC20(token).safeTransferFrom(msg.sender, address(pool), tokenIn);
        uint256 received = IERC20(token).balanceOf(address(pool)) - balanceBefore;
        if (received != tokenIn) revert TokenTransferMismatch(tokenIn, received);

        nativeOut = pool.swapExactTokensForNative(tokenIn, minNativeOut, recipient);
    }

    function liquidityPosition(address token)
        external
        view
        returns (LiquidityPosition memory position)
    {
        LocalConstantProductPool pool = _pool(token);
        position = LiquidityPosition({
            pool: address(pool),
            asset: address(pool),
            positionId: uint256(uint160(address(pool))),
            principal: pool.totalSupply()
        });
    }

    function getPoolState(address token) external view returns (PoolState memory state) {
        LocalConstantProductPool pool = _pool(token);
        state = PoolState({
            pool: address(pool),
            tokenReserve: IERC20(token).balanceOf(address(pool)),
            nativeReserve: address(pool).balance,
            totalLiquidity: pool.totalSupply(),
            initialized: pool.initialized()
        });
    }

    function _pool(address token) private view returns (LocalConstantProductPool pool) {
        address poolAddress = poolFor[token];
        if (poolAddress == address(0)) revert PoolDoesNotExist(token);
        pool = LocalConstantProductPool(payable(poolAddress));
    }

    function _checkDeadline(uint256 deadline) private view {
        // forge-lint: disable-next-line(block-timestamp)
        if (deadline < block.timestamp) revert DeadlineExpired(deadline, block.timestamp);
    }

    function _salt(address token) private pure returns (bytes32) {
        return keccak256(abi.encode(token));
    }

    receive() external payable {
        revert DirectNativeTransferForbidden();
    }
}
