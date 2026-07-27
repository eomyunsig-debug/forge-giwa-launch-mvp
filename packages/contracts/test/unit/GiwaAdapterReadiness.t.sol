// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { GiwaV2Adapter } from "../../src/giwa/GiwaV2Adapter.sol";
import { ProtocolConfig } from "../../src/ProtocolConfig.sol";
import { MockToken } from "../mocks/MockToken.sol";
import { TestBase } from "../TestBase.sol";

contract GiwaAdapterReadinessTest is TestBase {
    function testDisabledIntegrationFailsClosedWithoutInventedAddresses() external {
        GiwaV2Adapter adapter =
            new GiwaV2Adapter(block.chainid, address(0), address(0), address(0), false);
        MockToken token = new MockToken();

        assertFalse(adapter.isConfigured());
        vm.expectRevert(GiwaV2Adapter.UnsupportedIntegration.selector);
        adapter.createPool(address(token));

        vm.expectRevert(GiwaV2Adapter.UnsupportedIntegration.selector);
        adapter.quoteExactInput(address(token), true, 1 ether);
    }

    function testDisabledIntegrationCannotBeAllowlisted() external {
        GiwaV2Adapter adapter =
            new GiwaV2Adapter(block.chainid, address(0), address(0), address(0), false);
        ProtocolConfig config =
            new ProtocolConfig(address(this), address(this), 0, 0.001 ether, false);

        vm.expectRevert(
            abi.encodeWithSelector(ProtocolConfig.AdapterNotConfigured.selector, address(adapter))
        );
        config.setAdapterApproval(address(adapter), true);
    }

    function testApprovedFlagStillRequiresCodeBearingDependencies() external {
        vm.expectRevert(GiwaV2Adapter.ZeroAddress.selector);
        new GiwaV2Adapter(block.chainid, address(0), address(0), address(0), true);
    }

    function testWrongChainCannotDeployEvenDisabledAdapter() external {
        vm.expectPartialRevert(GiwaV2Adapter.WrongChain.selector);
        new GiwaV2Adapter(block.chainid + 1, address(0), address(0), address(0), false);
    }
}
