// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { GiwaV2Adapter } from "../../src/giwa/GiwaV2Adapter.sol";
import { IAMMAdapter } from "../../src/interfaces/IAMMAdapter.sol";
import { LaunchToken } from "../../src/LaunchToken.sol";
import { MockToken } from "../mocks/MockToken.sol";
import { MockV2Factory, MockV2Router } from "../mocks/MockV2.sol";
import { TestBase } from "../TestBase.sol";

/// @dev Compatibility fixture only. This does not claim a GIWA DEX deployment exists.
contract V2AdapterCompatibilityTest is TestBase {
    address private constant LP_LOCKER = address(0x10CC);
    address private constant TRADER = address(0xB0B);

    MockToken private wrappedNative;
    MockV2Factory private v2Factory;
    MockV2Router private v2Router;
    GiwaV2Adapter private adapter;
    LaunchToken private token;

    function setUp() external {
        wrappedNative = new MockToken();
        v2Factory = new MockV2Factory(address(wrappedNative));
        v2Router = new MockV2Router(v2Factory, address(wrappedNative));
        v2Factory.setRouter(address(v2Router));
        adapter = new GiwaV2Adapter(
            block.chainid, address(v2Factory), address(v2Router), address(wrappedNative), true
        );
        token = new LaunchToken(
            "Compatibility",
            "COMP",
            address(this),
            "ipfs://compatibility",
            keccak256("compatibility")
        );
        vm.deal(address(this), 100 ether);
        vm.deal(TRADER, 100 ether);
    }

    function testApprovedV2FixtureCreateLiquidityQuoteBuyAndSell() external {
        assertTrue(adapter.isConfigured());
        address pool = adapter.createPool(address(token));
        assertTrue(pool.code.length != 0);

        uint256 tokenLiquidity = 1_000_000 ether;
        token.approve(address(adapter), tokenLiquidity);
        IAMMAdapter.LiquidityPosition memory position = adapter.addInitialLiquidity{
            value: 1 ether
        }(
            address(token), tokenLiquidity, 1, block.timestamp + 5 minutes, LP_LOCKER
        );
        assertEq(position.pool, pool);
        assertEq(position.asset, pool);
        assertGt(position.principal, 0);
        assertEq(position.principal, adapter.initialLiquidity(address(token)));

        uint256 quote = adapter.quoteExactInput(address(token), true, 0.1 ether);
        vm.prank(TRADER);
        uint256 bought = adapter.buy{ value: 0.1 ether }(
            address(token), quote, block.timestamp + 5 minutes, TRADER
        );
        assertEq(bought, quote);
        assertEq(token.balanceOf(TRADER), bought);

        uint256 sellAmount = bought / 2;
        vm.prank(TRADER);
        token.approve(address(adapter), sellAmount);
        uint256 sellQuote = adapter.quoteExactInput(address(token), false, sellAmount);
        vm.prank(TRADER);
        uint256 nativeOut = adapter.sell(
            address(token), sellAmount, sellQuote, block.timestamp + 5 minutes, TRADER
        );
        assertEq(nativeOut, sellQuote);
        assertEq(token.allowance(TRADER, address(adapter)), 0);

        IAMMAdapter.PoolState memory state = adapter.getPoolState(address(token));
        assertTrue(state.initialized);
        assertEq(state.pool, pool);
        assertGt(state.tokenReserve, 0);
        assertGt(state.nativeReserve, 0);
    }

    function testInitialLiquidityCannotBeAddedTwice() external {
        adapter.createPool(address(token));
        uint256 tokenLiquidity = 1_000_000 ether;
        token.approve(address(adapter), tokenLiquidity * 2);
        adapter.addInitialLiquidity{ value: 1 ether }(
            address(token), tokenLiquidity, 1, block.timestamp + 5 minutes, LP_LOCKER
        );

        vm.expectPartialRevert(GiwaV2Adapter.InitialLiquidityAlreadyAdded.selector);
        adapter.addInitialLiquidity{ value: 1 ether }(
            address(token), tokenLiquidity, 1, block.timestamp + 5 minutes, LP_LOCKER
        );
    }
}
