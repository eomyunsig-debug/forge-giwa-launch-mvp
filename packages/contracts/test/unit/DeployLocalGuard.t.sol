// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { DeployLocal } from "../../script/DeployLocal.s.sol";
import { LocalConstantProductAdapter } from "../../src/local/LocalConstantProductAdapter.sol";
import { TestBase } from "../TestBase.sol";

contract DeployLocalGuardTest is TestBase {
    function testLocalFixtureCannotDeployOnMainnet() external {
        vm.chainId(1);
        vm.setEnv("DEPLOYER_PRIVATE_KEY", "1");

        DeployLocal deployer = new DeployLocal();
        vm.expectRevert(
            abi.encodeWithSelector(DeployLocal.UnsupportedLocalChain.selector, uint256(1))
        );
        deployer.run();

        vm.expectRevert(
            abi.encodeWithSelector(
                LocalConstantProductAdapter.UnsupportedLocalChain.selector, uint256(1)
            )
        );
        new LocalConstantProductAdapter();
    }
}
