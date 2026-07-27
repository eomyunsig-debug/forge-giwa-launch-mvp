// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IAMMAdapter } from "../interfaces/IAMMAdapter.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
import { ReentrancyGuard } from "../lib/ReentrancyGuard.sol";
import { SafeERC20 } from "../lib/SafeERC20.sol";

interface IV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IV2Router {
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function getAmountsIn(uint256 amountOut, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IV2Pair is IERC20 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 time);
}

/// @notice V2-compatible adapter for a separately verified GIWA testnet DEX.
/// @dev No address is embedded or inferred. Deployment reverts unless every
///      dependency is non-zero, code-bearing, and running on expectedChainId.
contract GiwaV2Adapter is IAMMAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error AddressHasNoCode(address target);
    error WrongChain(uint256 expected, uint256 actual);
    error UnsupportedIntegration();
    error PoolUnavailable(address token);
    error InvalidPair(address pair, address token);
    error InvalidAmount();
    error DeadlineExpired(uint256 deadline, uint256 currentTimestamp);
    error InitialLiquidityAlreadyAdded(address token);
    error PartialInitialLiquidityUse(
        uint256 expectedToken, uint256 usedToken, uint256 expectedNative, uint256 usedNative
    );
    error InsufficientLiquidityMinted(uint256 minimum, uint256 actual);
    error TokenTransferMismatch(uint256 expected, uint256 actual);
    error UnexpectedNativeSender(address sender);

    uint256 public immutable expectedChainId;
    bool public immutable integrationApproved;
    IV2Factory public immutable v2Factory;
    IV2Router public immutable v2Router;
    address public immutable wrappedNative;
    mapping(address token => uint256 initialLPPrincipal) public initialLiquidity;

    event GiwaV2PoolResolved(address indexed token, address indexed pool, bool created);

    constructor(
        uint256 expectedChainId_,
        address v2Factory_,
        address v2Router_,
        address wrappedNative_,
        bool integrationApproved_
    ) {
        if (expectedChainId_ == 0) {
            revert WrongChain(expectedChainId_, block.chainid);
        }
        if (block.chainid != expectedChainId_) {
            revert WrongChain(expectedChainId_, block.chainid);
        }

        expectedChainId = expectedChainId_;
        integrationApproved = integrationApproved_;
        v2Factory = IV2Factory(v2Factory_);
        v2Router = IV2Router(v2Router_);
        wrappedNative = wrappedNative_;

        if (integrationApproved_) {
            _requireContract(v2Factory_);
            _requireContract(v2Router_);
            _requireContract(wrappedNative_);
        }
    }

    function adapterId() external pure returns (bytes32) {
        return keccak256("FORGE_GIWA_V2_COMPATIBLE_CANDIDATE_V1");
    }

    function isTestOnly() external pure returns (bool) {
        return false;
    }

    function isConfigured() external view returns (bool) {
        return integrationApproved && block.chainid == expectedChainId
            && address(v2Factory).code.length != 0 && address(v2Router).code.length != 0
            && wrappedNative.code.length != 0;
    }

    function createPool(address token) public returns (address pool) {
        _checkChainAndToken(token);
        pool = v2Factory.getPair(token, wrappedNative);
        bool created;
        if (pool == address(0)) {
            pool = v2Factory.createPair(token, wrappedNative);
            created = true;
        }
        _validatePair(pool, token);
        emit GiwaV2PoolResolved(token, pool, created);
    }

    function addInitialLiquidity(
        address token,
        uint256 tokenAmount,
        uint256 minLiquidity,
        uint256 deadline,
        address lpRecipient
    ) external payable nonReentrant returns (LiquidityPosition memory position) {
        _checkChainAndToken(token);
        _checkDeadline(deadline);
        if (lpRecipient == address(0)) revert ZeroAddress();
        if (tokenAmount == 0 || msg.value == 0) revert InvalidAmount();
        if (initialLiquidity[token] != 0) revert InitialLiquidityAlreadyAdded(token);

        address pool = v2Factory.getPair(token, wrappedNative);
        _validatePair(pool, token);

        uint256 adapterBalanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        uint256 received = IERC20(token).balanceOf(address(this)) - adapterBalanceBefore;
        if (received != tokenAmount) revert TokenTransferMismatch(tokenAmount, received);

        IERC20(token).forceApprove(address(v2Router), tokenAmount);
        uint256 lpBalanceBefore = IERC20(pool).balanceOf(lpRecipient);
        (uint256 usedToken, uint256 usedNative, uint256 liquidity) = v2Router.addLiquidityETH{
            value: msg.value
        }(
            token, tokenAmount, tokenAmount, msg.value, lpRecipient, deadline
        );
        IERC20(token).forceApprove(address(v2Router), 0);

        if (usedToken != tokenAmount || usedNative != msg.value) {
            revert PartialInitialLiquidityUse(tokenAmount, usedToken, msg.value, usedNative);
        }
        if (liquidity < minLiquidity) {
            revert InsufficientLiquidityMinted(minLiquidity, liquidity);
        }
        uint256 receivedLP = IERC20(pool).balanceOf(lpRecipient) - lpBalanceBefore;
        if (receivedLP != liquidity) revert TokenTransferMismatch(liquidity, receivedLP);
        if (IERC20(token).balanceOf(address(this)) != adapterBalanceBefore) {
            revert TokenTransferMismatch(
                adapterBalanceBefore, IERC20(token).balanceOf(address(this))
            );
        }

        initialLiquidity[token] = liquidity;
        position = LiquidityPosition({
            pool: pool, asset: pool, positionId: uint256(uint160(pool)), principal: liquidity
        });
    }

    function quoteExactInput(address token, bool nativeToToken, uint256 amountIn)
        external
        view
        returns (uint256 amountOut)
    {
        _checkChainAndToken(token);
        if (amountIn == 0) revert InvalidAmount();
        address[] memory path = _path(token, nativeToToken);
        uint256[] memory amounts = v2Router.getAmountsOut(amountIn, path);
        amountOut = amounts[amounts.length - 1];
    }

    function quoteExactOutput(address token, bool nativeToToken, uint256 amountOut)
        external
        view
        returns (uint256 amountIn)
    {
        _checkChainAndToken(token);
        if (amountOut == 0) revert InvalidAmount();
        address[] memory path = _path(token, nativeToToken);
        uint256[] memory amounts = v2Router.getAmountsIn(amountOut, path);
        amountIn = amounts[0];
    }

    function buy(address token, uint256 minTokenOut, uint256 deadline, address recipient)
        external
        payable
        nonReentrant
        returns (uint256 tokenOut)
    {
        _checkChainAndToken(token);
        _checkDeadline(deadline);
        if (recipient == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert InvalidAmount();

        address[] memory path = _path(token, true);
        uint256[] memory amounts = v2Router.swapExactETHForTokens{ value: msg.value }(
            minTokenOut, path, recipient, deadline
        );
        tokenOut = amounts[amounts.length - 1];
    }

    function sell(
        address token,
        uint256 tokenIn,
        uint256 minNativeOut,
        uint256 deadline,
        address recipient
    ) external nonReentrant returns (uint256 nativeOut) {
        _checkChainAndToken(token);
        _checkDeadline(deadline);
        if (recipient == address(0)) revert ZeroAddress();
        if (tokenIn == 0) revert InvalidAmount();

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenIn);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;
        if (received != tokenIn) revert TokenTransferMismatch(tokenIn, received);

        IERC20(token).forceApprove(address(v2Router), tokenIn);
        address[] memory path = _path(token, false);
        uint256[] memory amounts =
            v2Router.swapExactTokensForETH(tokenIn, minNativeOut, path, recipient, deadline);
        IERC20(token).forceApprove(address(v2Router), 0);
        if (IERC20(token).balanceOf(address(this)) != balanceBefore) {
            revert TokenTransferMismatch(balanceBefore, IERC20(token).balanceOf(address(this)));
        }
        nativeOut = amounts[amounts.length - 1];
    }

    function liquidityPosition(address token)
        external
        view
        returns (LiquidityPosition memory position)
    {
        _checkChainAndToken(token);
        address pool = v2Factory.getPair(token, wrappedNative);
        _validatePair(pool, token);
        position = LiquidityPosition({
            pool: pool,
            asset: pool,
            positionId: uint256(uint160(pool)),
            principal: initialLiquidity[token]
        });
    }

    function getPoolState(address token) external view returns (PoolState memory state) {
        _checkChainAndToken(token);
        address pool = v2Factory.getPair(token, wrappedNative);
        if (pool == address(0)) {
            return PoolState({
                pool: address(0),
                tokenReserve: 0,
                nativeReserve: 0,
                totalLiquidity: 0,
                initialized: false
            });
        }
        _validatePair(pool, token);

        (uint112 reserve0, uint112 reserve1,) = IV2Pair(pool).getReserves();
        bool tokenIsZero = IV2Pair(pool).token0() == token;
        state = PoolState({
            pool: pool,
            tokenReserve: tokenIsZero ? reserve0 : reserve1,
            nativeReserve: tokenIsZero ? reserve1 : reserve0,
            totalLiquidity: IERC20(pool).totalSupply(),
            initialized: reserve0 != 0 && reserve1 != 0
        });
    }

    function _checkChainAndToken(address token) private view {
        if (!integrationApproved) revert UnsupportedIntegration();
        if (block.chainid != expectedChainId) {
            revert WrongChain(expectedChainId, block.chainid);
        }
        _requireContract(token);
        _requireContract(address(v2Factory));
        _requireContract(address(v2Router));
        _requireContract(wrappedNative);
    }

    function _validatePair(address pair, address token) private view {
        if (pair == address(0) || pair.code.length == 0) revert PoolUnavailable(token);
        address token0 = IV2Pair(pair).token0();
        address token1 = IV2Pair(pair).token1();
        if (!((token0 == token && token1 == wrappedNative)
                    || (token1 == token && token0 == wrappedNative))) {
            revert InvalidPair(pair, token);
        }
    }

    function _path(address token, bool nativeToToken) private view returns (address[] memory path) {
        path = new address[](2);
        if (nativeToToken) {
            path[0] = wrappedNative;
            path[1] = token;
        } else {
            path[0] = token;
            path[1] = wrappedNative;
        }
    }

    function _checkDeadline(uint256 deadline) private view {
        // forge-lint: disable-next-line(block-timestamp)
        if (deadline < block.timestamp) revert DeadlineExpired(deadline, block.timestamp);
    }

    function _requireContract(address target) private view {
        if (target == address(0)) revert ZeroAddress();
        if (target.code.length == 0) revert AddressHasNoCode(target);
    }

    receive() external payable {
        if (!integrationApproved) revert UnsupportedIntegration();
        if (msg.sender != address(v2Router)) revert UnexpectedNativeSender(msg.sender);
    }
}
