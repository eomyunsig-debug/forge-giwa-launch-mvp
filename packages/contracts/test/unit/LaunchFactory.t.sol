// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { CreatorVestingVault } from "../../src/CreatorVestingVault.sol";
import { LaunchFactory } from "../../src/LaunchFactory.sol";
import { LaunchToken } from "../../src/LaunchToken.sol";
import { LocalConstantProductAdapter } from "../../src/local/LocalConstantProductAdapter.sol";
import { PermanentLiquidityLocker } from "../../src/PermanentLiquidityLocker.sol";
import { ProtocolConfig } from "../../src/ProtocolConfig.sol";
import { RevertingAdapter } from "../mocks/RevertingAdapter.sol";
import { TestBase } from "../TestBase.sol";

contract LaunchFactoryTest is TestBase {
    uint256 private constant FEE = 0.001 ether;
    uint256 private constant INITIAL_NATIVE = 1 ether;
    uint256 private constant SUPPLY = 1_000_000_000 ether;
    address private constant CREATOR = address(0xC0FFEE);
    address private constant FEE_RECIPIENT = address(0xFEE);
    address private constant OUTSIDER = address(0xBAD);

    ProtocolConfig private config;
    LocalConstantProductAdapter private adapter;
    LaunchFactory private factory;

    event CreationFeeAccrued(
        uint256 indexed launchId, address indexed payer, uint256 amount, uint256 totalAccrued
    );

    function setUp() external {
        config = new ProtocolConfig(address(this), FEE_RECIPIENT, FEE, 0.01 ether, true);
        adapter = new LocalConstantProductAdapter();
        config.setAdapterApproval(address(adapter), true);
        factory = new LaunchFactory(config);
        vm.deal(CREATOR, 100 ether);
    }

    function testAtomicLaunchCreatesFixedTokenVestingPoolAndPermanentLock() external {
        (uint256 launchId, LaunchFactory.LaunchRecord memory record) =
            _launch(_request(500, address(adapter)));

        uint256 allocation = SUPPLY * 500 / 10_000;
        assertEq(launchId, 1);
        assertEq(record.creator, CREATOR);
        assertEq(record.creatorAllocation, allocation);
        assertEq(record.initialTokenLiquidity, SUPPLY - allocation);
        assertEq(record.initialNativeLiquidity, INITIAL_NATIVE);
        assertEq(record.creationFeePaid, FEE);
        assertEq(factory.launchIdByToken(record.token), 1);

        LaunchToken token = LaunchToken(record.token);
        CreatorVestingVault vault = CreatorVestingVault(record.vestingVault);
        PermanentLiquidityLocker locker = PermanentLiquidityLocker(record.liquidityLocker);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(record.vestingVault), allocation);
        assertEq(vault.creator(), CREATOR);
        assertEq(vault.totalAllocation(), allocation);
        assertEq(token.balanceOf(address(factory)), 0);
        assertEq(token.balanceOf(record.pool), SUPPLY - allocation);
        assertTrue(locker.principalIntact());
        assertEq(locker.currentPrincipalBalance(), record.lpPrincipal);
        assertEq(record.lpAsset, record.pool);
    }

    function testCreationFeeAccountingAndEventFields() external {
        vm.expectEmit(true, true, false, true);
        emit CreationFeeAccrued(1, CREATOR, FEE, FEE);
        _launch(_request(500, address(adapter)));

        assertEq(factory.totalCreationFeesAccrued(), FEE);
        assertEq(factory.availableCreationFees(), FEE);
        assertEq(address(factory).balance, FEE);

        vm.prank(OUTSIDER);
        vm.expectRevert(
            abi.encodeWithSelector(LaunchFactory.UnauthorizedFeeWithdrawal.selector, OUTSIDER)
        );
        factory.withdrawCreationFees(FEE);

        vm.prank(FEE_RECIPIENT);
        factory.withdrawCreationFees(FEE);
        assertEq(factory.totalCreationFeesWithdrawn(), FEE);
        assertEq(factory.availableCreationFees(), 0);
        assertEq(FEE_RECIPIENT.balance, FEE);
    }

    function testForcedNativeCannotBeWithdrawnAsProtocolFees() external {
        _launch(_request(500, address(adapter)));
        vm.deal(address(factory), address(factory).balance + 1);

        assertEq(factory.unaccountedNativeBalance(), 1);
        vm.prank(FEE_RECIPIENT);
        factory.withdrawCreationFees(FEE);
        assertEq(address(factory).balance, 1);
        assertEq(factory.unaccountedNativeBalance(), 1);
    }

    function testCreatorAllocationCapIsEnforced() external {
        LaunchFactory.LaunchRequest memory request = _request(1001, address(adapter));
        vm.prank(CREATOR);
        vm.expectPartialRevert(LaunchFactory.CreatorAllocationTooHigh.selector);
        factory.launch{ value: FEE + INITIAL_NATIVE }(request);
        assertEq(factory.launchCount(), 0);
    }

    function testZeroCreatorAllocationIsSupportedAndDisclosed() external {
        (, LaunchFactory.LaunchRecord memory record) = _launch(_request(0, address(adapter)));
        assertEq(record.creatorAllocation, 0);
        assertEq(record.initialTokenLiquidity, SUPPLY);
        assertEq(LaunchToken(record.token).balanceOf(record.vestingVault), 0);
    }

    function testExcessOrInsufficientNativeValueRevertsWithoutRefundAmbiguity() external {
        LaunchFactory.LaunchRequest memory request = _request(500, address(adapter));

        vm.prank(CREATOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchFactory.IncorrectNativeValue.selector,
                FEE + INITIAL_NATIVE,
                FEE + INITIAL_NATIVE + 1
            )
        );
        factory.launch{ value: FEE + INITIAL_NATIVE + 1 }(request);

        vm.prank(CREATOR);
        vm.expectPartialRevert(LaunchFactory.IncorrectNativeValue.selector);
        factory.launch{ value: INITIAL_NATIVE }(request);
        assertEq(factory.launchCount(), 0);
    }

    function testUnapprovedAndInvalidAdapterAreBlocked() external {
        LocalConstantProductAdapter unapproved = new LocalConstantProductAdapter();
        LaunchFactory.LaunchRequest memory request = _request(500, address(unapproved));
        vm.prank(CREATOR);
        vm.expectRevert(
            abi.encodeWithSelector(LaunchFactory.AdapterNotApproved.selector, address(unapproved))
        );
        factory.launch{ value: FEE + INITIAL_NATIVE }(request);

        request.adapter = address(0);
        vm.prank(CREATOR);
        vm.expectRevert(LaunchFactory.ZeroAddress.selector);
        factory.launch{ value: FEE + INITIAL_NATIVE }(request);
    }

    function testPoolCreationFailureRevertsEntireLaunch() external {
        RevertingAdapter revertingAdapter = new RevertingAdapter();
        config.setAdapterApproval(address(revertingAdapter), true);

        vm.prank(CREATOR);
        vm.expectRevert(RevertingAdapter.PoolCreationFailed.selector);
        factory.launch{ value: FEE + INITIAL_NATIVE }(_request(500, address(revertingAdapter)));

        assertEq(factory.launchCount(), 0);
        assertEq(factory.totalCreationFeesAccrued(), 0);
        assertEq(address(factory).balance, 0);
    }

    function testMinimumLpSlippageFailureIsAtomic() external {
        LaunchFactory.LaunchRequest memory request = _request(500, address(adapter));
        request.minLiquidityTokens = type(uint256).max;

        vm.prank(CREATOR);
        vm.expectPartialRevert(LocalConstantProductAdapter.InsufficientLiquidityMinted.selector);
        factory.launch{ value: FEE + INITIAL_NATIVE }(request);
        assertEq(factory.launchCount(), 0);
    }

    function testNameSymbolMetadataAndDeadlineValidation() external {
        LaunchFactory.LaunchRequest memory request = _request(500, address(adapter));
        request.symbol = "bad";
        vm.prank(CREATOR);
        vm.expectPartialRevert(LaunchFactory.InvalidSymbolCharacter.selector);
        factory.launch{ value: FEE + INITIAL_NATIVE }(request);

        request = _request(500, address(adapter));
        request.name = "";
        vm.prank(CREATOR);
        vm.expectPartialRevert(LaunchFactory.InvalidNameLength.selector);
        factory.launch{ value: FEE + INITIAL_NATIVE }(request);

        request = _request(500, address(adapter));
        request.metadataHash = bytes32(0);
        vm.prank(CREATOR);
        vm.expectRevert(LaunchFactory.EmptyMetadataHash.selector);
        factory.launch{ value: FEE + INITIAL_NATIVE }(request);

        request = _request(500, address(adapter));
        request.deadline = block.timestamp + 1 hours + 1;
        vm.prank(CREATOR);
        vm.expectPartialRevert(LaunchFactory.InvalidDeadline.selector);
        factory.launch{ value: FEE + INITIAL_NATIVE }(request);
    }

    function _launch(LaunchFactory.LaunchRequest memory request)
        private
        returns (uint256 launchId, LaunchFactory.LaunchRecord memory record)
    {
        vm.prank(CREATOR);
        return factory.launch{ value: FEE + INITIAL_NATIVE }(request);
    }

    function _request(uint16 allocationBps, address adapterAddress)
        private
        view
        returns (LaunchFactory.LaunchRequest memory request)
    {
        request = LaunchFactory.LaunchRequest({
            name: "Forge Community",
            symbol: "F0RGE",
            metadataURI: "ipfs://bafy-forge-metadata",
            metadataHash: keccak256("forge-metadata"),
            creatorAllocationBps: allocationBps,
            initialNativeLiquidity: INITIAL_NATIVE,
            minLiquidityTokens: 1,
            deadline: block.timestamp + 10 minutes,
            adapter: adapterAddress
        });
    }
}
