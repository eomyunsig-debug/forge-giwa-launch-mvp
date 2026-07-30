// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { CreatorVestingVault } from "../../src/CreatorVestingVault.sol";
import {
    GiwaTestnetConstantProductAdapter
} from "../../src/giwa/GiwaTestnetConstantProductAdapter.sol";
import { IAMMAdapter } from "../../src/interfaces/IAMMAdapter.sol";
import { LaunchFactory } from "../../src/LaunchFactory.sol";
import { LaunchToken } from "../../src/LaunchToken.sol";
import { LocalConstantProductAdapter } from "../../src/local/LocalConstantProductAdapter.sol";
import { PermanentLiquidityLocker } from "../../src/PermanentLiquidityLocker.sol";
import { ProtocolConfig } from "../../src/ProtocolConfig.sol";
import { InvariantTestBase, Vm } from "../TestBase.sol";

contract LaunchInvariantHandler {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    IAMMAdapter public immutable adapter;
    LaunchToken public immutable token;
    CreatorVestingVault public immutable vault;
    address public immutable creator;

    constructor(
        IAMMAdapter adapter_,
        LaunchToken token_,
        CreatorVestingVault vault_,
        address creator_
    ) {
        adapter = adapter_;
        token = token_;
        vault = vault_;
        creator = creator_;
    }

    function buy(uint96 rawNativeIn) external {
        uint256 nativeIn = _bound(rawNativeIn, 1 wei, 0.05 ether);
        if (address(this).balance < nativeIn) return;
        try adapter.buy{ value: nativeIn }(
            address(token), 1, block.timestamp + 5 minutes, address(this)
        ) { }
            catch { }
    }

    function sell(uint128 rawTokenIn) external {
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) return;
        uint256 tokenIn = _bound(rawTokenIn, 1, balance);
        token.approve(address(adapter), tokenIn);
        try adapter.sell(address(token), tokenIn, 1, block.timestamp + 5 minutes, address(this)) { }
            catch { }
    }

    function claim(uint48 rawForwardSeconds) external {
        uint256 forwardSeconds = _bound(rawForwardSeconds, 0, 60 days);
        vm.warp(block.timestamp + forwardSeconds);
        if (vault.claimable() != 0) {
            vault.claim();
        }
    }

    function _bound(uint256 value, uint256 minimum, uint256 maximum)
        private
        pure
        returns (uint256)
    {
        if (value >= minimum && value <= maximum) return value;
        return minimum + value % (maximum - minimum + 1);
    }

    receive() external payable { }
}

contract LaunchInvariantsTest is InvariantTestBase {
    uint256 private constant FEE = 0.001 ether;
    uint256 private constant SUPPLY = 1_000_000_000 ether;
    address private constant CREATOR_ONE = address(0xC01);
    address private constant CREATOR_TWO = address(0xC02);

    ProtocolConfig private config;
    LocalConstantProductAdapter private adapter;
    LaunchFactory private factory;
    LaunchFactory.LaunchRecord private first;
    LaunchFactory.LaunchRecord private second;
    LaunchInvariantHandler private handler;

    function setUp() external {
        config = new ProtocolConfig(address(this), address(0xFEE), FEE, 0.01 ether, true);
        adapter = new LocalConstantProductAdapter();
        config.setAdapterApproval(address(adapter), true);
        factory = new LaunchFactory(config);
        vm.deal(CREATOR_ONE, 10 ether);
        vm.deal(CREATOR_TWO, 10 ether);

        vm.prank(CREATOR_ONE);
        (, first) = factory.launch{ value: FEE + 1 ether }(_request("ONE", 500));
        vm.prank(CREATOR_TWO);
        (, second) = factory.launch{ value: FEE + 1 ether }(_request("TWO", 1000));

        handler = new LaunchInvariantHandler(
            IAMMAdapter(address(adapter)),
            LaunchToken(first.token),
            CreatorVestingVault(first.vestingVault),
            CREATOR_ONE
        );
        vm.deal(address(handler), 1000 ether);
        targetContract(address(handler));
    }

    function invariantTokenSupplyCanNeverIncreaseOrDecrease() external view {
        assertEq(LaunchToken(first.token).totalSupply(), SUPPLY);
        assertEq(LaunchToken(second.token).totalSupply(), SUPPLY);
    }

    function invariantVaultNeverPaysMoreThanItsAllocation() external view {
        CreatorVestingVault firstVault = CreatorVestingVault(first.vestingVault);
        CreatorVestingVault secondVault = CreatorVestingVault(second.vestingVault);
        assertLe(firstVault.released(), firstVault.totalAllocation());
        assertLe(secondVault.released(), secondVault.totalAllocation());
        assertEq(
            LaunchToken(first.token).balanceOf(first.vestingVault) + firstVault.released(),
            firstVault.totalAllocation()
        );
        assertEq(
            LaunchToken(second.token).balanceOf(second.vestingVault) + secondVault.released(),
            secondVault.totalAllocation()
        );
    }

    function invariantLockedLiquidityPrincipalNeverLeavesLocker() external view {
        PermanentLiquidityLocker firstLocker = PermanentLiquidityLocker(first.liquidityLocker);
        PermanentLiquidityLocker secondLocker = PermanentLiquidityLocker(second.liquidityLocker);
        assertTrue(firstLocker.principalIntact());
        assertTrue(secondLocker.principalIntact());
        assertGe(firstLocker.currentPrincipalBalance(), first.lpPrincipal);
        assertGe(secondLocker.currentPrincipalBalance(), second.lpPrincipal);
    }

    function invariantFeeAccountingMatchesActualTrackedBalance() external view {
        assertEq(
            factory.totalCreationFeesAccrued() - factory.totalCreationFeesWithdrawn(),
            factory.availableCreationFees()
        );
        assertEq(address(factory).balance, factory.availableCreationFees());
    }

    function invariantPoolAccountingMatchesActualBalances() external view {
        IAMMAdapter.PoolState memory state = adapter.getPoolState(first.token);
        assertEq(LaunchToken(first.token).balanceOf(first.pool), state.tokenReserve);
        assertEq(first.pool.balance, state.nativeReserve);
    }

    function invariantLaunchAssetsNeverMix() external view {
        assertTrue(first.token != second.token);
        assertTrue(first.pool != second.pool);
        assertTrue(first.vestingVault != second.vestingVault);
        assertTrue(first.liquidityLocker != second.liquidityLocker);
        assertEq(LaunchToken(first.token).balanceOf(second.vestingVault), 0);
        assertEq(LaunchToken(second.token).balanceOf(first.vestingVault), 0);
        assertEq(factory.launchIdByToken(first.token), 1);
        assertEq(factory.launchIdByToken(second.token), 2);
    }

    function _request(string memory symbol, uint16 allocationBps)
        private
        view
        returns (LaunchFactory.LaunchRequest memory)
    {
        return LaunchFactory.LaunchRequest({
            name: "Invariant",
            symbol: symbol,
            metadataURI: "ipfs://invariant",
            metadataHash: keccak256(bytes(symbol)),
            creatorAllocationBps: allocationBps,
            initialNativeLiquidity: 1 ether,
            minLiquidityTokens: 1,
            deadline: block.timestamp + 10 minutes,
            adapter: address(adapter)
        });
    }
}

contract GiwaTestnetLaunchInvariantsTest is InvariantTestBase {
    uint256 private constant FEE = 0.001 ether;
    uint256 private constant SUPPLY = 1_000_000_000 ether;
    address private constant CREATOR_ONE = address(0xC01);
    address private constant CREATOR_TWO = address(0xC02);

    ProtocolConfig private config;
    GiwaTestnetConstantProductAdapter private adapter;
    LaunchFactory private factory;
    LaunchFactory.LaunchRecord private first;
    LaunchFactory.LaunchRecord private second;
    LaunchInvariantHandler private handler;

    function setUp() external {
        vm.chainId(91_342);
        config = new ProtocolConfig(address(this), address(0xFEE), FEE, 0.01 ether, true);
        adapter = new GiwaTestnetConstantProductAdapter();
        config.setAdapterApproval(address(adapter), true);
        factory = new LaunchFactory(config);
        vm.deal(CREATOR_ONE, 10 ether);
        vm.deal(CREATOR_TWO, 10 ether);

        vm.prank(CREATOR_ONE);
        (, first) = factory.launch{ value: FEE + 1 ether }(_request("ONE", 500));
        vm.prank(CREATOR_TWO);
        (, second) = factory.launch{ value: FEE + 1 ether }(_request("TWO", 1000));

        handler = new LaunchInvariantHandler(
            IAMMAdapter(address(adapter)),
            LaunchToken(first.token),
            CreatorVestingVault(first.vestingVault),
            CREATOR_ONE
        );
        vm.deal(address(handler), 1000 ether);
        targetContract(address(handler));
    }

    function invariantGiwaTestnetTokenSupplyCanNeverIncreaseOrDecrease() external view {
        assertEq(LaunchToken(first.token).totalSupply(), SUPPLY);
        assertEq(LaunchToken(second.token).totalSupply(), SUPPLY);
    }

    function invariantGiwaTestnetVaultNeverPaysMoreThanItsAllocation() external view {
        CreatorVestingVault firstVault = CreatorVestingVault(first.vestingVault);
        CreatorVestingVault secondVault = CreatorVestingVault(second.vestingVault);
        assertLe(firstVault.released(), firstVault.totalAllocation());
        assertLe(secondVault.released(), secondVault.totalAllocation());
        assertEq(
            LaunchToken(first.token).balanceOf(first.vestingVault) + firstVault.released(),
            firstVault.totalAllocation()
        );
        assertEq(
            LaunchToken(second.token).balanceOf(second.vestingVault) + secondVault.released(),
            secondVault.totalAllocation()
        );
    }

    function invariantGiwaTestnetLockedLiquidityPrincipalNeverLeavesLocker() external view {
        PermanentLiquidityLocker firstLocker = PermanentLiquidityLocker(first.liquidityLocker);
        PermanentLiquidityLocker secondLocker = PermanentLiquidityLocker(second.liquidityLocker);
        assertTrue(firstLocker.principalIntact());
        assertTrue(secondLocker.principalIntact());
        assertGe(firstLocker.currentPrincipalBalance(), first.lpPrincipal);
        assertGe(secondLocker.currentPrincipalBalance(), second.lpPrincipal);
    }

    function invariantGiwaTestnetFeeAccountingMatchesActualTrackedBalance() external view {
        assertEq(
            factory.totalCreationFeesAccrued() - factory.totalCreationFeesWithdrawn(),
            factory.availableCreationFees()
        );
        assertEq(address(factory).balance, factory.availableCreationFees());
    }

    function invariantGiwaTestnetPoolAccountingMatchesActualBalances() external view {
        IAMMAdapter.PoolState memory state = adapter.getPoolState(first.token);
        assertEq(LaunchToken(first.token).balanceOf(first.pool), state.tokenReserve);
        assertEq(first.pool.balance, state.nativeReserve);
    }

    function invariantGiwaTestnetLaunchAssetsNeverMix() external view {
        assertTrue(first.token != second.token);
        assertTrue(first.pool != second.pool);
        assertTrue(first.vestingVault != second.vestingVault);
        assertTrue(first.liquidityLocker != second.liquidityLocker);
        assertEq(LaunchToken(first.token).balanceOf(second.vestingVault), 0);
        assertEq(LaunchToken(second.token).balanceOf(first.vestingVault), 0);
        assertEq(factory.launchIdByToken(first.token), 1);
        assertEq(factory.launchIdByToken(second.token), 2);
    }

    function _request(string memory symbol, uint16 allocationBps)
        private
        view
        returns (LaunchFactory.LaunchRequest memory)
    {
        return LaunchFactory.LaunchRequest({
            name: "GIWA Testnet Invariant",
            symbol: symbol,
            metadataURI: "ipfs://giwa-testnet-invariant",
            metadataHash: keccak256(bytes(symbol)),
            creatorAllocationBps: allocationBps,
            initialNativeLiquidity: 1 ether,
            minLiquidityTokens: 1,
            deadline: block.timestamp + 10 minutes,
            adapter: address(adapter)
        });
    }
}
