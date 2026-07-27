// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IAMMAdapter } from "../../src/interfaces/IAMMAdapter.sol";
import { LaunchFactory } from "../../src/LaunchFactory.sol";
import { LaunchToken } from "../../src/LaunchToken.sol";
import { LocalConstantProductAdapter } from "../../src/local/LocalConstantProductAdapter.sol";
import { LocalConstantProductPool } from "../../src/local/LocalConstantProductPool.sol";
import { PermanentLiquidityLocker } from "../../src/PermanentLiquidityLocker.sol";
import { ProtocolConfig } from "../../src/ProtocolConfig.sol";
import { TestBase } from "../TestBase.sol";

contract LocalVerticalFlowTest is TestBase {
    uint256 private constant FEE = 0.001 ether;
    uint256 private constant INITIAL_NATIVE = 2 ether;
    address private constant CREATOR = address(0xC0FFEE);
    address private constant BUYER = address(0xB0B);

    LocalConstantProductAdapter private adapter;
    LaunchFactory private factory;
    LaunchFactory.LaunchRecord private launchRecord;

    function setUp() external {
        ProtocolConfig config =
            new ProtocolConfig(address(this), address(0xFEE), FEE, 0.01 ether, true);
        adapter = new LocalConstantProductAdapter();
        config.setAdapterApproval(address(adapter), true);
        factory = new LaunchFactory(config);

        vm.deal(CREATOR, 100 ether);
        vm.deal(BUYER, 100 ether);
        vm.prank(CREATOR);
        (, launchRecord) = factory.launch{ value: FEE + INITIAL_NATIVE }(
            LaunchFactory.LaunchRequest({
                name: "Vertical Forge",
                symbol: "VERT",
                metadataURI: "ipfs://vertical-flow",
                metadataHash: keccak256("vertical-flow"),
                creatorAllocationBps: 500,
                initialNativeLiquidity: INITIAL_NATIVE,
                minLiquidityTokens: 1,
                deadline: block.timestamp + 10 minutes,
                adapter: address(adapter)
            })
        );
    }

    function testDeterministicPoolLaunchBuySellAndLockedLiquidityFlow() external {
        address predicted = adapter.computePoolAddress(launchRecord.token);
        assertEq(predicted, launchRecord.pool);

        IAMMAdapter.PoolState memory beforeState = adapter.getPoolState(launchRecord.token);
        assertTrue(beforeState.initialized);
        assertEq(beforeState.pool, launchRecord.pool);
        assertEq(beforeState.nativeReserve, INITIAL_NATIVE);
        assertEq(beforeState.tokenReserve, launchRecord.initialTokenLiquidity);

        uint256 nativeIn = 0.1 ether;
        uint256 quotedTokenOut = adapter.quoteExactInput(launchRecord.token, true, nativeIn);
        uint256 minimumTokenOut = quotedTokenOut * 99 / 100;
        vm.prank(BUYER);
        uint256 bought = adapter.buy{ value: nativeIn }(
            launchRecord.token, minimumTokenOut, block.timestamp + 5 minutes, BUYER
        );
        assertEq(bought, quotedTokenOut);
        assertEq(LaunchToken(launchRecord.token).balanceOf(BUYER), bought);

        uint256 tokenToSell = bought / 2;
        uint256 quotedNativeOut = adapter.quoteExactInput(launchRecord.token, false, tokenToSell);
        vm.prank(BUYER);
        LaunchToken(launchRecord.token).approve(address(adapter), tokenToSell);
        uint256 nativeBalanceBeforeSell = BUYER.balance;
        vm.prank(BUYER);
        uint256 soldFor = adapter.sell(
            launchRecord.token,
            tokenToSell,
            quotedNativeOut * 99 / 100,
            block.timestamp + 5 minutes,
            BUYER
        );
        assertEq(soldFor, quotedNativeOut);
        assertEq(BUYER.balance, nativeBalanceBeforeSell + soldFor);
        assertEq(LaunchToken(launchRecord.token).allowance(BUYER, address(adapter)), 0);

        PermanentLiquidityLocker locker = PermanentLiquidityLocker(launchRecord.liquidityLocker);
        assertTrue(locker.principalIntact());
        assertEq(locker.currentPrincipalBalance(), launchRecord.lpPrincipal);

        IAMMAdapter.PoolState memory afterState = adapter.getPoolState(launchRecord.token);
        assertGe(
            afterState.tokenReserve * afterState.nativeReserve,
            beforeState.tokenReserve * beforeState.nativeReserve
        );
    }

    function testExactOutputQuoteRoundsUpToCoverRequestedOutput() external view {
        uint256 desiredTokens = 1000 ether;
        uint256 requiredNative = adapter.quoteExactOutput(launchRecord.token, true, desiredTokens);
        uint256 actualTokens = adapter.quoteExactInput(launchRecord.token, true, requiredNative);
        assertGe(actualTokens, desiredTokens);
    }

    function testDeadlineAndMinimumOutputAreEnforced() external {
        vm.prank(BUYER);
        vm.expectPartialRevert(LocalConstantProductAdapter.DeadlineExpired.selector);
        adapter.buy{ value: 0.1 ether }(launchRecord.token, 1, block.timestamp - 1, BUYER);

        uint256 quote = adapter.quoteExactInput(launchRecord.token, true, 0.1 ether);
        vm.prank(BUYER);
        vm.expectPartialRevert(LocalConstantProductPool.InsufficientOutput.selector);
        adapter.buy{ value: 0.1 ether }(
            launchRecord.token, quote + 1, block.timestamp + 5 minutes, BUYER
        );
        assertEq(LaunchToken(launchRecord.token).balanceOf(BUYER), 0);
    }

    function testQuoteBecomesStaleAfterInterveningTrade() external {
        uint256 amountIn = 0.1 ether;
        uint256 staleQuote = adapter.quoteExactInput(launchRecord.token, true, amountIn);

        vm.prank(CREATOR);
        adapter.buy{ value: 1 ether }(launchRecord.token, 1, block.timestamp + 5 minutes, CREATOR);

        vm.prank(BUYER);
        vm.expectPartialRevert(LocalConstantProductPool.InsufficientOutput.selector);
        adapter.buy{ value: amountIn }(
            launchRecord.token, staleQuote, block.timestamp + 5 minutes, BUYER
        );
    }

    function testUnsolicitedTokenDonationCannotPermanentlyBlockSells() external {
        vm.prank(BUYER);
        uint256 bought = adapter.buy{ value: 0.1 ether }(
            launchRecord.token, 1, block.timestamp + 5 minutes, BUYER
        );

        vm.prank(BUYER);
        assertTrue(LaunchToken(launchRecord.token).transfer(launchRecord.pool, 1));
        uint256 sellAmount = bought / 2;
        vm.prank(BUYER);
        LaunchToken(launchRecord.token).approve(address(adapter), sellAmount);
        vm.prank(BUYER);
        uint256 nativeOut =
            adapter.sell(launchRecord.token, sellAmount, 1, block.timestamp + 5 minutes, BUYER);

        assertGt(nativeOut, 0);
        IAMMAdapter.PoolState memory state = adapter.getPoolState(launchRecord.token);
        assertEq(LaunchToken(launchRecord.token).balanceOf(launchRecord.pool), state.tokenReserve);
    }
}
