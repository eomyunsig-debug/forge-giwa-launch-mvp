// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "../interfaces/IERC20.sol";
import { ERC20 } from "../lib/ERC20.sol";
import { ProtocolConstants } from "../lib/ProtocolConstants.sol";
import { ReentrancyGuard } from "../lib/ReentrancyGuard.sol";
import { SafeERC20 } from "../lib/SafeERC20.sol";

/// @notice Deterministic constant-product fixture for local Anvil integration only.
/// @dev This contract is not a production AMM. It intentionally has no liquidity
///      removal path, protocol fee, oracle, flash-swap, or administrative surface.
contract LocalConstantProductPool is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error Unauthorized(address caller);
    error ZeroAddress();
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidAmount();
    error TokenBalanceMismatch(uint256 expected, uint256 actual);
    error InsufficientLiquidity();
    error InsufficientOutput(uint256 minimum, uint256 actual);
    error NativeTransferFailed(address recipient, uint256 amount);
    error DirectNativeTransferForbidden();

    IERC20 public immutable token;
    address public immutable adapter;
    uint256 public tokenReserve;
    uint256 public nativeReserve;
    bool public initialized;

    event InitialLiquidityAdded(
        uint256 tokenAmount, uint256 nativeAmount, uint256 liquidity, address indexed recipient
    );
    event Swap(
        address indexed recipient,
        bool indexed nativeToToken,
        uint256 amountIn,
        uint256 amountOut,
        uint256 tokenReserve,
        uint256 nativeReserve
    );
    event ReservesSynced(uint256 tokenReserve, uint256 nativeReserve);

    constructor(IERC20 token_, address adapter_) ERC20("Forge Local LP", "FLP") {
        if (address(token_) == address(0) || adapter_ == address(0)) revert ZeroAddress();
        token = token_;
        adapter = adapter_;
    }

    modifier onlyAdapter() {
        if (msg.sender != adapter) revert Unauthorized(msg.sender);
        _;
    }

    function initialize(uint256 tokenAmount, address lpRecipient)
        external
        payable
        onlyAdapter
        nonReentrant
        returns (uint256 liquidity)
    {
        if (initialized) revert AlreadyInitialized();
        if (lpRecipient == address(0)) revert ZeroAddress();
        if (tokenAmount == 0 || msg.value == 0) revert InvalidAmount();

        uint256 actualTokenBalance = token.balanceOf(address(this));
        if (actualTokenBalance != tokenAmount) {
            revert TokenBalanceMismatch(tokenAmount, actualTokenBalance);
        }

        liquidity = _sqrt(tokenAmount * msg.value);
        if (liquidity == 0) revert InsufficientLiquidity();

        initialized = true;
        tokenReserve = tokenAmount;
        nativeReserve = msg.value;
        _mint(lpRecipient, liquidity);
        emit InitialLiquidityAdded(tokenAmount, msg.value, liquidity, lpRecipient);
    }

    function swapExactNativeForTokens(uint256 minTokenOut, address recipient)
        external
        payable
        onlyAdapter
        nonReentrant
        returns (uint256 tokenOut)
    {
        if (!initialized) revert NotInitialized();
        if (recipient == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert InvalidAmount();

        tokenReserve = token.balanceOf(address(this));
        nativeReserve = address(this).balance - msg.value;
        tokenOut = _quoteExactInput(msg.value, nativeReserve, tokenReserve);
        if (tokenOut < minTokenOut) revert InsufficientOutput(minTokenOut, tokenOut);

        nativeReserve += msg.value;
        tokenReserve -= tokenOut;
        token.safeTransfer(recipient, tokenOut);

        emit Swap(recipient, true, msg.value, tokenOut, tokenReserve, nativeReserve);
    }

    /// @dev The adapter must transfer exactly tokenIn into this pool before calling.
    function swapExactTokensForNative(uint256 tokenIn, uint256 minNativeOut, address recipient)
        external
        onlyAdapter
        nonReentrant
        returns (uint256 nativeOut)
    {
        if (!initialized) revert NotInitialized();
        if (recipient == address(0)) revert ZeroAddress();
        if (tokenIn == 0) revert InvalidAmount();

        uint256 expectedBalance = tokenReserve + tokenIn;
        uint256 actualBalance = token.balanceOf(address(this));
        if (actualBalance != expectedBalance) {
            revert TokenBalanceMismatch(expectedBalance, actualBalance);
        }

        nativeOut = _quoteExactInput(tokenIn, tokenReserve, nativeReserve);
        if (nativeOut < minNativeOut) revert InsufficientOutput(minNativeOut, nativeOut);

        tokenReserve += tokenIn;
        nativeReserve -= nativeOut;
        (bool success,) = recipient.call{ value: nativeOut }("");
        if (!success) revert NativeTransferFailed(recipient, nativeOut);

        emit Swap(recipient, false, tokenIn, nativeOut, tokenReserve, nativeReserve);
    }

    /// @notice Accounts for unsolicited token or force-sent native donations.
    /// @dev Called by the adapter immediately before a sell transfer.
    function sync() external onlyAdapter {
        if (!initialized) revert NotInitialized();
        tokenReserve = token.balanceOf(address(this));
        nativeReserve = address(this).balance;
        emit ReservesSynced(tokenReserve, nativeReserve);
    }

    function quoteExactInput(bool nativeToToken, uint256 amountIn)
        external
        view
        returns (uint256 amountOut)
    {
        if (!initialized) revert NotInitialized();
        if (nativeToToken) {
            return _quoteExactInput(amountIn, address(this).balance, token.balanceOf(address(this)));
        }
        return _quoteExactInput(amountIn, token.balanceOf(address(this)), address(this).balance);
    }

    function quoteExactOutput(bool nativeToToken, uint256 amountOut)
        external
        view
        returns (uint256 amountIn)
    {
        if (!initialized) revert NotInitialized();
        if (nativeToToken) {
            return
                _quoteExactOutput(amountOut, address(this).balance, token.balanceOf(address(this)));
        }
        return _quoteExactOutput(amountOut, token.balanceOf(address(this)), address(this).balance);
    }

    function _quoteExactInput(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        private
        pure
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert InvalidAmount();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();

        uint256 inputWithFee =
            amountIn * (ProtocolConstants.BPS_DENOMINATOR - ProtocolConstants.LOCAL_SWAP_FEE_BPS);
        amountOut = inputWithFee * reserveOut
            / (reserveIn * ProtocolConstants.BPS_DENOMINATOR + inputWithFee);
        if (amountOut == 0 || amountOut >= reserveOut) revert InsufficientLiquidity();
    }

    function _quoteExactOutput(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        private
        pure
        returns (uint256 amountIn)
    {
        if (amountOut == 0) revert InvalidAmount();
        if (reserveIn == 0 || amountOut >= reserveOut) revert InsufficientLiquidity();

        uint256 numerator = reserveIn * amountOut * ProtocolConstants.BPS_DENOMINATOR;
        uint256 denominator = (reserveOut - amountOut)
            * (ProtocolConstants.BPS_DENOMINATOR - ProtocolConstants.LOCAL_SWAP_FEE_BPS);
        amountIn = numerator / denominator + 1;
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value == 0) return 0;
        uint256 candidate = (value + 1) / 2;
        result = value;
        while (candidate < result) {
            result = candidate;
            candidate = (value / candidate + candidate) / 2;
        }
    }

    receive() external payable {
        revert DirectNativeTransferForbidden();
    }
}
