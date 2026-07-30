// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { DeployGiwa } from "../../script/DeployGiwa.s.sol";
import {
    GiwaTestnetConstantProductAdapter
} from "../../src/giwa/GiwaTestnetConstantProductAdapter.sol";
import { IAMMAdapter } from "../../src/interfaces/IAMMAdapter.sol";
import { LaunchFactory } from "../../src/LaunchFactory.sol";
import { ProtocolConfig } from "../../src/ProtocolConfig.sol";
import { TestBase } from "../TestBase.sol";

contract DeployGiwaGuardTest is TestBase {
    function testDeploymentScriptRejectsNonGiwaSepoliaChainBeforeReadingSecrets() external {
        DeployGiwa deployer = new DeployGiwa();
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployGiwa.UnsupportedGiwaChain.selector, uint256(91_342), block.chainid
            )
        );
        deployer.run();
    }

    /// @dev Environment mutation is intentionally kept in one test because
    ///      setEnv changes process-global state while Forge may run tests in parallel.
    function testDeploymentModesAreExplicitAndFailClosed() external {
        vm.chainId(91_342);
        vm.setEnv("USE_SELF_HOSTED_TEST_AMM", "true");
        vm.setEnv("GIWA_AMM_INTEGRATION_APPROVED", "false");
        vm.setEnv("DEPLOYER_PRIVATE_KEY", "1");

        DeployGiwa deployer = new DeployGiwa();
        (ProtocolConfig config, LaunchFactory factory, IAMMAdapter adapter) = deployer.run();

        assertTrue(config.allowTestAdapters());
        assertTrue(config.adapterEnabled(address(adapter)));
        assertTrue(adapter.isConfigured());
        assertTrue(adapter.isTestOnly());
        assertEq(adapter.adapterId(), keccak256("FORGE_GIWA_SEPOLIA_SELF_HOSTED_TEST_ONLY_CP_V1"));
        assertEq(address(factory.config()), address(config));
        assertTrue(address(adapter).code.length != 0);

        vm.setEnv("USE_SELF_HOSTED_TEST_AMM", "false");
        vm.setEnv("GIWA_AMM_INTEGRATION_APPROVED", "false");
        (ProtocolConfig disabledConfig,, IAMMAdapter disabledAdapter) = deployer.run();

        assertFalse(disabledConfig.allowTestAdapters());
        assertFalse(disabledConfig.adapterEnabled(address(disabledAdapter)));
        assertFalse(disabledAdapter.isConfigured());
        assertFalse(disabledAdapter.isTestOnly());

        vm.setEnv("USE_SELF_HOSTED_TEST_AMM", "true");
        vm.setEnv("GIWA_AMM_INTEGRATION_APPROVED", "true");

        vm.expectRevert(DeployGiwa.ConflictingAmmModes.selector);
        deployer.run();
    }

    function testGiwaTestAdapterCannotDeployOnAnvil() external {
        vm.expectRevert(
            abi.encodeWithSelector(
                GiwaTestnetConstantProductAdapter.WrongChain.selector,
                uint256(91_342),
                block.chainid
            )
        );
        new GiwaTestnetConstantProductAdapter();
    }
}
