// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { CreatorVestingVault } from "../../src/CreatorVestingVault.sol";
import { MockToken } from "../mocks/MockToken.sol";
import { TestBase } from "../TestBase.sol";

contract VestingFuzzTest is TestBase {
    address private constant CREATOR = address(0xC0FFEE);
    uint48 private constant START = 1_000_000;
    uint48 private constant CLIFF = START + 1 days;
    uint48 private constant END = START + 30 days;

    function testFuzzVestedAmountNeverExceedsAllocation(uint128 rawAllocation, uint48 rawTimestamp)
        external
    {
        uint256 allocation = bound(rawAllocation, 0, type(uint128).max);
        CreatorVestingVault vault = _vault(allocation);
        uint48 timestamp = uint48(bound(rawTimestamp, 0, END + 365 days));

        uint256 vested = vault.vestedAmountAt(timestamp);
        assertLe(vested, allocation);
        if (timestamp < CLIFF) assertEq(vested, 0);
        if (timestamp >= END) assertEq(vested, allocation);
    }

    function testFuzzArbitraryClaimOrderCannotOverRelease(
        uint128 rawAllocation,
        uint48 firstTimestamp,
        uint48 secondTimestamp
    ) external {
        uint256 allocation = bound(rawAllocation, 1, type(uint128).max);
        CreatorVestingVault vault = _vault(allocation);
        MockToken token = MockToken(address(vault.token()));

        uint48 first = uint48(bound(firstTimestamp, START, END + 365 days));
        uint48 second = uint48(bound(secondTimestamp, START, END + 365 days));
        if (second < first) {
            (first, second) = (second, first);
        }

        vm.warp(first);
        _claimIfAvailable(vault);
        uint256 afterFirst = vault.released();
        assertLe(afterFirst, allocation);

        vm.warp(second);
        _claimIfAvailable(vault);
        assertLe(vault.released(), allocation);
        assertEq(token.balanceOf(CREATOR), vault.released());
        assertEq(token.balanceOf(address(vault)) + vault.released(), allocation);
    }

    function testFuzzRepeatedClaimAtSameTimestampCannotDoubleCount(
        uint128 rawAllocation,
        uint48 rawTimestamp
    ) external {
        uint256 allocation = bound(rawAllocation, 1, type(uint128).max);
        CreatorVestingVault vault = _vault(allocation);
        uint48 timestamp = uint48(bound(rawTimestamp, CLIFF, END + 365 days));
        vm.warp(timestamp);
        if (vault.claimable() == 0) vm.warp(END);

        vault.claim();
        uint256 released = vault.released();
        vm.expectRevert(CreatorVestingVault.NothingToClaim.selector);
        vault.claim();
        assertEq(vault.released(), released);
        assertLe(released, allocation);
    }

    function _vault(uint256 allocation) private returns (CreatorVestingVault vault) {
        MockToken token = new MockToken();
        vault = new CreatorVestingVault(token, CREATOR, allocation, START, CLIFF, END);
        token.mint(address(vault), allocation);
    }

    function _claimIfAvailable(CreatorVestingVault vault) private {
        if (vault.claimable() != 0) vault.claim();
    }
}
