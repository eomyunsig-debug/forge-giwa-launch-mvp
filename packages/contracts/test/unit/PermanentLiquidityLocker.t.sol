// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { PermanentLiquidityLocker } from "../../src/PermanentLiquidityLocker.sol";
import { MockToken } from "../mocks/MockToken.sol";
import { TestBase } from "../TestBase.sol";

contract PermanentLiquidityLockerTest is TestBase {
    address private constant ADAPTER = address(0xAD);
    address private constant POOL = address(0xB001);
    address private constant OUTSIDER = address(0xBAD);
    uint256 private constant PRINCIPAL = 100 ether;

    MockToken private lpToken;
    PermanentLiquidityLocker private locker;

    function setUp() external {
        lpToken = new MockToken();
        locker = new PermanentLiquidityLocker(address(this));
        lpToken.mint(address(locker), PRINCIPAL);
        locker.initialize(ADAPTER, POOL, lpToken, uint256(uint160(POOL)), PRINCIPAL);
    }

    function testPrincipalIsDirectlyVerifiable() external view {
        assertTrue(locker.initialized());
        assertTrue(locker.principalIntact());
        assertEq(locker.currentPrincipalBalance(), PRINCIPAL);
        assertEq(locker.principalAmount(), PRINCIPAL);
        assertEq(address(locker.positionAsset()), address(lpToken));
    }

    function testNoPrincipalOrEmergencyWithdrawalSurface() external {
        vm.prank(OUTSIDER);
        (bool withdrawSuccess,) =
            address(locker).call(abi.encodeWithSignature("withdraw(address,uint256)", OUTSIDER, 1));
        vm.prank(OUTSIDER);
        (bool emergencySuccess,) =
            address(locker).call(abi.encodeWithSignature("emergencyWithdraw(address)", OUTSIDER));

        assertFalse(withdrawSuccess);
        assertFalse(emergencySuccess);
        assertEq(lpToken.balanceOf(address(locker)), PRINCIPAL);
    }

    function testCannotInitializeTwice() external {
        vm.expectRevert(PermanentLiquidityLocker.AlreadyInitialized.selector);
        locker.initialize(ADAPTER, POOL, lpToken, uint256(uint160(POOL)), PRINCIPAL);
    }
}
