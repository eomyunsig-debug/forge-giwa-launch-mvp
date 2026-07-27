// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "../../src/interfaces/IERC20.sol";
import { ERC20 } from "../../src/lib/ERC20.sol";
import { SafeERC20 } from "../../src/lib/SafeERC20.sol";

contract MockV2Pair is ERC20 {
    using SafeERC20 for IERC20;

    error Unauthorized();
    error InvalidPairToken();
    error AlreadyInitialized();
    error InvalidAmount();
    error NativeTransferFailed();

    address public immutable token0;
    address public immutable token1;
    address public immutable router;
    address public immutable wrappedNative;
    address public launchToken;
    uint112 private _reserve0;
    uint112 private _reserve1;

    constructor(address tokenA, address tokenB, address router_, address wrappedNative_)
        ERC20("Mock V2 LP", "MV2LP")
    {
        token0 = tokenA;
        token1 = tokenB;
        router = router_;
        wrappedNative = wrappedNative_;
    }

    modifier onlyRouter() {
        if (msg.sender != router) revert Unauthorized();
        _;
    }

    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 timestamp)
    {
        return (_reserve0, _reserve1, uint32(block.timestamp));
    }

    function initialize(address token, uint256 tokenAmount, address recipient)
        external
        payable
        onlyRouter
        returns (uint256 liquidity)
    {
        if (launchToken != address(0)) revert AlreadyInitialized();
        if (!_validToken(token)) revert InvalidPairToken();
        if (tokenAmount == 0 || msg.value == 0) revert InvalidAmount();
        launchToken = token;
        liquidity = _sqrt(tokenAmount * msg.value);
        _mint(recipient, liquidity);
        _setReserves(tokenAmount, msg.value);
    }

    function quote(bool nativeToToken, uint256 amountIn) external view returns (uint256) {
        (uint256 tokenReserve, uint256 nativeReserve) = _reserves();
        if (nativeToToken) return _quote(amountIn, nativeReserve, tokenReserve);
        return _quote(amountIn, tokenReserve, nativeReserve);
    }

    function quoteOutput(bool nativeToToken, uint256 amountOut) external view returns (uint256) {
        (uint256 tokenReserve, uint256 nativeReserve) = _reserves();
        if (nativeToToken) return _quoteOutput(amountOut, nativeReserve, tokenReserve);
        return _quoteOutput(amountOut, tokenReserve, nativeReserve);
    }

    function buy(address recipient) external payable onlyRouter returns (uint256 tokenOut) {
        (uint256 tokenReserve, uint256 nativeReserve) = _reserves();
        tokenOut = _quote(msg.value, nativeReserve, tokenReserve);
        tokenReserve -= tokenOut;
        nativeReserve += msg.value;
        _setReserves(tokenReserve, nativeReserve);
        IERC20(launchToken).safeTransfer(recipient, tokenOut);
    }

    function sell(uint256 tokenIn, address recipient)
        external
        onlyRouter
        returns (uint256 nativeOut)
    {
        (uint256 tokenReserve, uint256 nativeReserve) = _reserves();
        nativeOut = _quote(tokenIn, tokenReserve, nativeReserve);
        tokenReserve += tokenIn;
        nativeReserve -= nativeOut;
        _setReserves(tokenReserve, nativeReserve);
        (bool success,) = recipient.call{ value: nativeOut }("");
        if (!success) revert NativeTransferFailed();
    }

    function _reserves() private view returns (uint256 tokenReserve, uint256 nativeReserve) {
        if (token0 == launchToken) return (_reserve0, _reserve1);
        return (_reserve1, _reserve0);
    }

    function _setReserves(uint256 tokenReserve, uint256 nativeReserve) private {
        if (token0 == launchToken) {
            // The compatibility fixture only receives bounded MVP test values.
            // forge-lint: disable-next-line(unsafe-typecast)
            _reserve0 = uint112(tokenReserve);
            // forge-lint: disable-next-line(unsafe-typecast)
            _reserve1 = uint112(nativeReserve);
        } else {
            // forge-lint: disable-next-line(unsafe-typecast)
            _reserve0 = uint112(nativeReserve);
            // forge-lint: disable-next-line(unsafe-typecast)
            _reserve1 = uint112(tokenReserve);
        }
    }

    function _validToken(address token) private view returns (bool) {
        return (token0 == token && token1 == wrappedNative)
            || (token1 == token && token0 == wrappedNative);
    }

    function _quote(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        private
        pure
        returns (uint256)
    {
        uint256 withFee = amountIn * 9970;
        return withFee * reserveOut / (reserveIn * 10_000 + withFee);
    }

    function _quoteOutput(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        private
        pure
        returns (uint256)
    {
        return reserveIn * amountOut * 10_000 / ((reserveOut - amountOut) * 9970) + 1;
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        uint256 candidate = (value + 1) / 2;
        result = value;
        while (candidate < result) {
            result = candidate;
            candidate = (value / candidate + candidate) / 2;
        }
    }
}

contract MockV2Factory {
    mapping(address => mapping(address => address)) public pairs;
    address public router;
    address public immutable wrappedNative;

    constructor(address wrappedNative_) {
        wrappedNative = wrappedNative_;
    }

    function setRouter(address router_) external {
        if (router != address(0)) revert();
        router = router_;
    }

    function getPair(address tokenA, address tokenB) external view returns (address) {
        return pairs[tokenA][tokenB];
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (pairs[tokenA][tokenB] != address(0)) revert();
        pair = address(new MockV2Pair(tokenA, tokenB, router, wrappedNative));
        pairs[tokenA][tokenB] = pair;
        pairs[tokenB][tokenA] = pair;
    }
}

contract MockV2Router {
    using SafeERC20 for IERC20;

    MockV2Factory public immutable factory;
    address public immutable wrappedNative;

    constructor(MockV2Factory factory_, address wrappedNative_) {
        factory = factory_;
        wrappedNative = wrappedNative_;
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256,
        uint256,
        address to,
        uint256
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        address pair = factory.pairs(token, wrappedNative);
        IERC20(token).safeTransferFrom(msg.sender, pair, amountTokenDesired);
        liquidity = MockV2Pair(payable(pair)).initialize{ value: msg.value }(
            token, amountTokenDesired, to
        );
        return (amountTokenDesired, msg.value, liquidity);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        address token = path[0] == wrappedNative ? path[1] : path[0];
        amounts[1] = MockV2Pair(payable(factory.pairs(token, wrappedNative)))
            .quote(path[0] == wrappedNative, amountIn);
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](2);
        amounts[1] = amountOut;
        address token = path[0] == wrappedNative ? path[1] : path[0];
        amounts[0] = MockV2Pair(payable(factory.pairs(token, wrappedNative)))
            .quoteOutput(path[0] == wrappedNative, amountOut);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external payable returns (uint256[] memory amounts) {
        address token = path[1];
        uint256 output =
            MockV2Pair(payable(factory.pairs(token, wrappedNative))).buy{ value: msg.value }(to);
        if (output < amountOutMin) revert();
        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = output;
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        address token = path[0];
        address pair = factory.pairs(token, wrappedNative);
        IERC20(token).safeTransferFrom(msg.sender, pair, amountIn);
        uint256 output = MockV2Pair(payable(pair)).sell(amountIn, to);
        if (output < amountOutMin) revert();
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = output;
    }
}
