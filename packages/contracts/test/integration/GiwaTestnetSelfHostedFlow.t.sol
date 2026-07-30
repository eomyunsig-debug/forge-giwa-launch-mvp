// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {
    GiwaTestnetConstantProductAdapter
} from "../../src/giwa/GiwaTestnetConstantProductAdapter.sol";
import { GiwaTestnetConstantProductPool } from "../../src/giwa/GiwaTestnetConstantProductPool.sol";
import { IAMMAdapter } from "../../src/interfaces/IAMMAdapter.sol";
import { LaunchFactory } from "../../src/LaunchFactory.sol";
import { LaunchToken } from "../../src/LaunchToken.sol";
import { PermanentLiquidityLocker } from "../../src/PermanentLiquidityLocker.sol";
import { ProtocolConfig } from "../../src/ProtocolConfig.sol";
import { TestBase } from "../TestBase.sol";

contract GiwaTestnetSelfHostedFlowTest is TestBase {
    uint256 private constant FEE = 0.001 ether;
    uint256 private constant INITIAL_NATIVE = 2 ether;
    address private constant CREATOR = address(0xC0FFEE);
    address private constant BUYER = address(0xB0B);

    GiwaTestnetConstantProductAdapter private adapter;
    LaunchFactory private factory;
    LaunchFactory.LaunchRecord private launchRecord;

    function setUp() external {
        vm.chainId(91_342);

        ProtocolConfig config =
            new ProtocolConfig(address(this), address(0xFEE), FEE, 0.01 ether, true);
        adapter = new GiwaTestnetConstantProductAdapter();
        config.setAdapterApproval(address(adapter), true);
        factory = new LaunchFactory(config);

        vm.deal(CREATOR, 100 ether);
        vm.deal(BUYER, 100 ether);
        vm.prank(CREATOR);
        (, launchRecord) = factory.launch{ value: FEE + INITIAL_NATIVE }(_request());
    }

    function testIdentityAndAdmissionRemainExplicitlyTestOnly() external {
        assertTrue(adapter.isConfigured());
        assertTrue(adapter.isTestOnly());
        assertEq(adapter.adapterId(), keccak256("FORGE_GIWA_SEPOLIA_SELF_HOSTED_TEST_ONLY_CP_V1"));

        ProtocolConfig production =
            new ProtocolConfig(address(this), address(this), 0, 0.01 ether, false);
        vm.expectRevert(
            abi.encodeWithSelector(ProtocolConfig.TestAdapterForbidden.selector, address(adapter))
        );
        production.setAdapterApproval(address(adapter), true);
    }

    function testDeterministicPoolLaunchBuySellAndLockedLiquidityFlow() external {
        assertEq(adapter.computePoolAddress(launchRecord.token), launchRecord.pool);

        PermanentLiquidityLocker locker = PermanentLiquidityLocker(launchRecord.liquidityLocker);
        assertTrue(locker.principalIntact());
        assertEq(locker.currentPrincipalBalance(), launchRecord.lpPrincipal);

        uint256 quote = adapter.quoteExactInput(launchRecord.token, true, 0.1 ether);
        vm.prank(BUYER);
        uint256 bought = adapter.buy{ value: 0.1 ether }(
            launchRecord.token, quote, block.timestamp + 5 minutes, BUYER
        );
        assertEq(bought, quote);
        assertEq(LaunchToken(launchRecord.token).balanceOf(BUYER), bought);

        uint256 sellAmount = bought / 2;
        vm.prank(BUYER);
        LaunchToken(launchRecord.token).approve(address(adapter), sellAmount);
        uint256 sellQuote = adapter.quoteExactInput(launchRecord.token, false, sellAmount);
        vm.prank(BUYER);
        uint256 nativeOut = adapter.sell(
            launchRecord.token, sellAmount, sellQuote, block.timestamp + 5 minutes, BUYER
        );
        assertEq(nativeOut, sellQuote);
        assertEq(LaunchToken(launchRecord.token).allowance(BUYER, address(adapter)), 0);
        assertTrue(locker.principalIntact());
    }

    function testDeadlineAndMinimumOutputAreEnforced() external {
        vm.prank(BUYER);
        vm.expectPartialRevert(GiwaTestnetConstantProductAdapter.DeadlineExpired.selector);
        adapter.buy{ value: 0.1 ether }(launchRecord.token, 1, block.timestamp - 1, BUYER);

        uint256 quote = adapter.quoteExactInput(launchRecord.token, true, 0.1 ether);
        vm.prank(BUYER);
        vm.expectPartialRevert(GiwaTestnetConstantProductPool.InsufficientOutput.selector);
        adapter.buy{ value: 0.1 ether }(
            launchRecord.token, quote + 1, block.timestamp + 5 minutes, BUYER
        );
        assertEq(LaunchToken(launchRecord.token).balanceOf(BUYER), 0);
    }

    function testExactOutputQuoteRoundsUpToCoverRequestedOutput() external view {
        uint256 desiredTokenOut = 1000 ether;
        uint256 nativeIn = adapter.quoteExactOutput(launchRecord.token, true, desiredTokenOut);
        uint256 quotedOut = adapter.quoteExactInput(launchRecord.token, true, nativeIn);
        assertGe(quotedOut, desiredTokenOut);
    }

    function testQuoteBecomesStaleAfterInterveningTrade() external {
        uint256 amountIn = 0.1 ether;
        uint256 staleQuote = adapter.quoteExactInput(launchRecord.token, true, amountIn);

        vm.prank(CREATOR);
        adapter.buy{ value: 1 ether }(launchRecord.token, 1, block.timestamp + 5 minutes, CREATOR);

        vm.prank(BUYER);
        vm.expectPartialRevert(GiwaTestnetConstantProductPool.InsufficientOutput.selector);
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
        assertEq(launchRecord.pool.balance, state.nativeReserve);
    }

    function testRuntimeChainDriftFailsClosed() external {
        vm.chainId(1);
        assertFalse(adapter.isConfigured());
        vm.expectRevert(
            abi.encodeWithSelector(
                GiwaTestnetConstantProductAdapter.WrongChain.selector, uint256(91_342), uint256(1)
            )
        );
        adapter.quoteExactInput(launchRecord.token, true, 1 ether);
    }

    function _request() private view returns (LaunchFactory.LaunchRequest memory) {
        return LaunchFactory.LaunchRequest({
            name: "GIWA Testnet Launch",
            symbol: "GIWA",
            metadataURI: "ipfs://giwa-testnet-fixture",
            metadataHash: keccak256("giwa-testnet-fixture"),
            creatorAllocationBps: 500,
            initialNativeLiquidity: INITIAL_NATIVE,
            minLiquidityTokens: 1,
            deadline: block.timestamp + 10 minutes,
            adapter: address(adapter)
        });
    }
}
