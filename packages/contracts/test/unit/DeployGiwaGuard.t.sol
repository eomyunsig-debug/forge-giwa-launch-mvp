// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { DeployGiwa } from "../../script/DeployGiwa.s.sol";
import { TestBase } from "../TestBase.sol";

contract DeployGiwaGuardTest is TestBase {
    function testDeploymentScriptRejectsNonGiwaSepoliaChainBeforeReadingSecrets() external {
        vm.setEnv("DEPLOYER_PRIVATE_KEY", "1");

        DeployGiwa deployer = new DeployGiwa();
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployGiwa.UnsupportedGiwaChain.selector, uint256(91_342), block.chainid
            )
        );
        deployer.run();
    }
}
