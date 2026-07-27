// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { CreatorVestingVault } from "../../src/CreatorVestingVault.sol";
import { IAMMAdapter } from "../../src/interfaces/IAMMAdapter.sol";
import { LaunchFactory } from "../../src/LaunchFactory.sol";
import { LaunchToken } from "../../src/LaunchToken.sol";
import { LocalConstantProductAdapter } from "../../src/local/LocalConstantProductAdapter.sol";
import { ProtocolConfig } from "../../src/ProtocolConfig.sol";
import { TestBase } from "../TestBase.sol";

contract LaunchFactoryFuzzTest is TestBase {
    uint256 private constant FEE = 0.001 ether;
    uint256 private constant SUPPLY = 1_000_000_000 ether;
    address private constant CREATOR = address(0xC0FFEE);

    ProtocolConfig private config;
    LocalConstantProductAdapter private adapter;
    LaunchFactory private factory;

    function setUp() external {
        config = new ProtocolConfig(address(this), address(0xFEE), FEE, 0.01 ether, true);
        adapter = new LocalConstantProductAdapter();
        config.setAdapterApproval(address(adapter), true);
        factory = new LaunchFactory(config);
        vm.deal(CREATOR, 1000 ether);
    }

    function testFuzzCreatorAllocationWithinCap(uint16 rawBps) external {
        uint16 allocationBps = uint16(bound(rawBps, 0, 1000));
        (, LaunchFactory.LaunchRecord memory record) =
            _launch(factory, adapter, CREATOR, allocationBps, 1 ether, "FUZZ");

        uint256 expectedAllocation = SUPPLY * allocationBps / 10_000;
        assertEq(record.creatorAllocation, expectedAllocation);
        assertEq(LaunchToken(record.token).balanceOf(record.vestingVault), expectedAllocation);
        assertEq(LaunchToken(record.token).balanceOf(record.pool), SUPPLY - expectedAllocation);
    }

    function testFuzzCreatorAllocationAboveCapAlwaysReverts(uint16 rawBps) external {
        uint16 allocationBps = uint16(bound(rawBps, 1001, type(uint16).max));
        vm.prank(CREATOR);
        vm.expectPartialRevert(LaunchFactory.CreatorAllocationTooHigh.selector);
        factory.launch{ value: FEE + 1 ether }(
            _request(allocationBps, 1 ether, "FUZZ", address(adapter))
        );
        assertEq(factory.launchCount(), 0);
    }

    function testFuzzInitialLiquidity(uint96 rawLiquidity) external {
        uint256 liquidity = bound(rawLiquidity, 0.01 ether, 100 ether);
        (, LaunchFactory.LaunchRecord memory record) =
            _launch(factory, adapter, CREATOR, 500, liquidity, "LIQ");

        IAMMAdapter.PoolState memory poolState = adapter.getPoolState(record.token);
        assertEq(poolState.nativeReserve, liquidity);
        assertEq(poolState.tokenReserve, record.initialTokenLiquidity);
        assertTrue(poolState.initialized);
    }

    function testFuzzNameLength(bytes calldata rawName) external {
        uint256 length = rawName.length;
        LaunchFactory.LaunchRequest memory request =
            _request(500, 1 ether, "NAME", address(adapter));
        request.name = string(rawName);

        vm.prank(CREATOR);
        if (length == 0 || length > 64) {
            vm.expectPartialRevert(LaunchFactory.InvalidNameLength.selector);
            factory.launch{ value: FEE + 1 ether }(request);
            assertEq(factory.launchCount(), 0);
        } else {
            factory.launch{ value: FEE + 1 ether }(request);
            assertEq(factory.launchCount(), 1);
        }
    }

    function testFuzzSymbolLength(uint8 rawLength) external {
        uint256 length = bound(rawLength, 0, 32);
        bytes memory symbolBytes = new bytes(length);
        for (uint256 index; index < length; ++index) {
            symbolBytes[index] = "A";
        }

        LaunchFactory.LaunchRequest memory request = _request(500, 1 ether, "SYM", address(adapter));
        request.symbol = string(symbolBytes);
        vm.prank(CREATOR);
        if (length < 2 || length > 10) {
            vm.expectPartialRevert(LaunchFactory.InvalidSymbolLength.selector);
            factory.launch{ value: FEE + 1 ether }(request);
            assertEq(factory.launchCount(), 0);
        } else {
            factory.launch{ value: FEE + 1 ether }(request);
            assertEq(factory.launchCount(), 1);
        }
    }

    function testFuzzCreationFeeAccountingIsExact(uint96 rawFee) external {
        uint256 fee = bound(rawFee, 0, 10 ether);
        ProtocolConfig feeConfig =
            new ProtocolConfig(address(this), address(0xFEE), fee, 0.01 ether, true);
        LocalConstantProductAdapter feeAdapter = new LocalConstantProductAdapter();
        feeConfig.setAdapterApproval(address(feeAdapter), true);
        LaunchFactory feeFactory = new LaunchFactory(feeConfig);

        _launch(feeFactory, feeAdapter, CREATOR, 500, 1 ether, "FEE");
        assertEq(feeFactory.totalCreationFeesAccrued(), fee);
        assertEq(address(feeFactory).balance, fee);
    }

    function testFuzzRepeatedLaunchesRemainIsolated(uint8 rawCount) external {
        uint256 count = bound(rawCount, 1, 4);
        address previousToken;
        address previousVault;
        for (uint256 index; index < count; ++index) {
            // `index < 4`, so this conversion cannot truncate.
            // forge-lint: disable-next-line(unsafe-typecast)
            (, LaunchFactory.LaunchRecord memory record) =
                _launch(factory, adapter, CREATOR, uint16(index * 100), 0.1 ether, "MULTI");
            assertTrue(record.token != previousToken);
            assertTrue(record.vestingVault != previousVault);
            assertEq(factory.launchIdByToken(record.token), index + 1);
            previousToken = record.token;
            previousVault = record.vestingVault;
        }
        assertEq(factory.launchCount(), count);
        assertEq(factory.totalCreationFeesAccrued(), FEE * count);
    }

    function testFuzzMultipleCreatorVaultsCannotMixFunds(uint16 rawFirst, uint16 rawSecond)
        external
    {
        uint16 firstBps = uint16(bound(rawFirst, 0, 1000));
        uint16 secondBps = uint16(bound(rawSecond, 0, 1000));
        address secondCreator = address(0xB0B);
        vm.deal(secondCreator, 100 ether);

        (, LaunchFactory.LaunchRecord memory first) =
            _launch(factory, adapter, CREATOR, firstBps, 0.1 ether, "FIRST");
        (, LaunchFactory.LaunchRecord memory second) =
            _launch(factory, adapter, secondCreator, secondBps, 0.1 ether, "SECOND");

        assertEq(CreatorVestingVault(first.vestingVault).creator(), CREATOR);
        assertEq(CreatorVestingVault(second.vestingVault).creator(), secondCreator);
        assertEq(LaunchToken(first.token).balanceOf(second.vestingVault), 0);
        assertEq(LaunchToken(second.token).balanceOf(first.vestingVault), 0);
        assertTrue(first.token != second.token);
    }

    function _launch(
        LaunchFactory targetFactory,
        LocalConstantProductAdapter targetAdapter,
        address creator,
        uint16 allocationBps,
        uint256 initialNative,
        string memory symbol
    ) private returns (uint256 launchId, LaunchFactory.LaunchRecord memory record) {
        uint256 creationFee = targetFactory.config().creationFee();
        vm.prank(creator);
        return targetFactory.launch{ value: creationFee + initialNative }(
            _request(allocationBps, initialNative, symbol, address(targetAdapter))
        );
    }

    function _request(
        uint16 allocationBps,
        uint256 initialNative,
        string memory symbol,
        address adapterAddress
    ) private view returns (LaunchFactory.LaunchRequest memory request) {
        request = LaunchFactory.LaunchRequest({
                name: "Fuzz Launch",
                symbol: symbol,
                metadataURI: "ipfs://fuzz",
                metadataHash: keccak256("fuzz"),
                creatorAllocationBps: allocationBps,
                initialNativeLiquidity: initialNative,
                minLiquidityTokens: 1,
                deadline: block.timestamp + 10 minutes,
                adapter: adapterAddress
            });
    }
}
