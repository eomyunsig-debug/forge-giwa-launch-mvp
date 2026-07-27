// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { CreatorVestingVault } from "../../src/CreatorVestingVault.sol";
import { MockToken } from "../mocks/MockToken.sol";
import { TestBase } from "../TestBase.sol";

contract CreatorVestingVaultTest is TestBase {
    address private constant CREATOR = address(0xC0FFEE);
    address private constant OUTSIDER = address(0xBAD);
    uint256 private constant ALLOCATION = 1_000_000 ether;
    uint48 private constant START = 1_000_000;
    uint48 private constant CLIFF = START + 1 days;
    uint48 private constant END = START + 30 days;

    MockToken private token;
    CreatorVestingVault private vault;

    function setUp() external {
        token = new MockToken();
        vault = new CreatorVestingVault(token, CREATOR, ALLOCATION, START, CLIFF, END);
        token.mint(address(vault), ALLOCATION);
        vm.warp(START);
    }

    function testClaimBeforeCliffReverts() external {
        vm.warp(CLIFF - 1);
        vm.expectRevert(CreatorVestingVault.NothingToClaim.selector);
        vault.claim();
        assertEq(vault.released(), 0);
    }

    function testLinearVestingAndDuplicateClaimAccounting() external {
        vm.warp(CLIFF);
        uint256 expectedAtCliff = ALLOCATION * (CLIFF - START) / (END - START);
        assertEq(vault.claimable(), expectedAtCliff);

        vm.prank(OUTSIDER);
        uint256 firstClaim = vault.claim();
        assertEq(firstClaim, expectedAtCliff);
        assertEq(token.balanceOf(CREATOR), expectedAtCliff);
        assertEq(vault.released(), expectedAtCliff);

        vm.expectRevert(CreatorVestingVault.NothingToClaim.selector);
        vault.claim();
        assertEq(vault.released(), expectedAtCliff);
    }

    function testFullVestingLeavesNoAllocationBehind() external {
        vm.warp(END + 1);
        uint256 amount = vault.claim();

        assertEq(amount, ALLOCATION);
        assertEq(token.balanceOf(CREATOR), ALLOCATION);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(vault.remainingAllocation(), 0);
        assertEq(vault.lockedAmount(), 0);
    }

    function testCreatorCannotBeChangedAndNoAdminWithdrawalExists() external {
        (bool creatorChangeSuccess,) =
            address(vault).call(abi.encodeWithSignature("setCreator(address)", OUTSIDER));
        (bool withdrawSuccess,) =
            address(vault).call(abi.encodeWithSignature("emergencyWithdraw(address)", OUTSIDER));

        assertFalse(creatorChangeSuccess);
        assertFalse(withdrawSuccess);
        assertEq(vault.creator(), CREATOR);
        assertEq(token.balanceOf(address(vault)), ALLOCATION);
    }
}
