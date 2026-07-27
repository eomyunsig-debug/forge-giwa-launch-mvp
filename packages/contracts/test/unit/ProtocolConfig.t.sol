// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { LocalConstantProductAdapter } from "../../src/local/LocalConstantProductAdapter.sol";
import { ProtocolConfig } from "../../src/ProtocolConfig.sol";
import { TestBase } from "../TestBase.sol";

contract ProtocolConfigTest is TestBase {
    address private constant ADMIN = address(0xAD);
    address private constant FEE_RECIPIENT = address(0xFEE);
    address private constant OUTSIDER = address(0xBAD);

    ProtocolConfig private config;
    LocalConstantProductAdapter private adapter;

    function setUp() external {
        config = new ProtocolConfig(ADMIN, FEE_RECIPIENT, 0.001 ether, 0.01 ether, true);
        adapter = new LocalConstantProductAdapter();
    }

    function testOnlyAdminCanChangeBoundedSettings() external {
        vm.prank(OUTSIDER);
        vm.expectRevert(abi.encodeWithSelector(ProtocolConfig.Unauthorized.selector, OUTSIDER));
        config.setCreationFee(0.002 ether);

        vm.prank(ADMIN);
        config.setCreationFee(0.002 ether);
        assertEq(config.creationFee(), 0.002 ether);

        vm.prank(ADMIN);
        vm.expectPartialRevert(ProtocolConfig.FeeTooHigh.selector);
        config.setCreationFee(10 ether + 1);
    }

    function testAdapterAdmissionAndRemoval() external {
        vm.prank(ADMIN);
        config.setAdapterApproval(address(adapter), true);
        assertTrue(config.adapterEnabled(address(adapter)));

        vm.prank(ADMIN);
        config.setAdapterApproval(address(adapter), false);
        assertFalse(config.adapterEnabled(address(adapter)));
    }

    function testProductionConfigRejectsTestOnlyAdapter() external {
        ProtocolConfig production =
            new ProtocolConfig(address(this), FEE_RECIPIENT, 0, 0.01 ether, false);

        vm.expectRevert(
            abi.encodeWithSelector(ProtocolConfig.TestAdapterForbidden.selector, address(adapter))
        );
        production.setAdapterApproval(address(adapter), true);
    }

    function testNoProxyUpgradeOrAdminTransferSurface() external {
        (bool upgradeSuccess,) =
            address(config).call(abi.encodeWithSignature("upgradeTo(address)", address(adapter)));
        (bool transferAdminSuccess,) =
            address(config).call(abi.encodeWithSignature("transferOwnership(address)", OUTSIDER));

        assertFalse(upgradeSuccess);
        assertFalse(transferAdminSuccess);
        assertEq(config.admin(), ADMIN);
    }
}
