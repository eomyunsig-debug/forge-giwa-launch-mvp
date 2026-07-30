// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { GiwaV2Adapter } from "../src/giwa/GiwaV2Adapter.sol";
import {
    GiwaTestnetConstantProductAdapter
} from "../src/giwa/GiwaTestnetConstantProductAdapter.sol";
import { IAMMAdapter } from "../src/interfaces/IAMMAdapter.sol";
import { LaunchFactory } from "../src/LaunchFactory.sol";
import { ProtocolConfig } from "../src/ProtocolConfig.sol";
import { ScriptBase } from "./ScriptBase.sol";

/// @notice Deploys a disabled GIWA adapter by default.
/// @dev USE_SELF_HOSTED_TEST_AMM explicitly selects Forge's unaudited GIWA
///      Sepolia-only AMM. It remains test-only on-chain. The V2 path remains
///      disabled unless its separate integration approval and addresses exist.
contract DeployGiwa is ScriptBase {
    uint256 internal constant GIWA_SEPOLIA_CHAIN_ID = 91_342;

    error UnsupportedGiwaChain(uint256 configuredChainId, uint256 actualChainId);
    error ConflictingAmmModes();
    error InvalidDeployerAddress();

    event GiwaStackDeployed(
        uint256 indexed chainId,
        address indexed protocolConfig,
        address indexed launchFactory,
        address ammAdapter,
        bytes32 adapterId,
        bool adapterEnabled,
        bool testOnly
    );

    function run()
        external
        returns (ProtocolConfig protocolConfig, LaunchFactory launchFactory, IAMMAdapter ammAdapter)
    {
        if (block.chainid != GIWA_SEPOLIA_CHAIN_ID) {
            revert UnsupportedGiwaChain(GIWA_SEPOLIA_CHAIN_ID, block.chainid);
        }

        bool useSelfHostedTestAmm = vm.envOr("USE_SELF_HOSTED_TEST_AMM", false);
        bool v2IntegrationApproved = vm.envOr("GIWA_AMM_INTEGRATION_APPROVED", false);
        if (useSelfHostedTestAmm && v2IntegrationApproved) revert ConflictingAmmModes();

        // The signer is loaded by Forge CLI (for example, --account) and never
        // passed to this script as a raw private key. Only its public address
        // crosses the script boundary.
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        if (deployer == address(0)) revert InvalidDeployerAddress();
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        uint256 creationFee = vm.envOr("CREATION_FEE_WEI", uint256(0));
        uint256 minimumLiquidity = vm.envOr("MIN_INITIAL_LIQUIDITY_WEI", uint256(0.001 ether));
        address v2Factory;
        address v2Router;
        address wrappedNative;
        if (!useSelfHostedTestAmm) {
            v2Factory = vm.envOr("GIWA_V2_FACTORY", address(0));
            v2Router = vm.envOr("GIWA_V2_ROUTER", address(0));
            wrappedNative = vm.envOr("GIWA_WRAPPED_NATIVE", address(0));
        }

        vm.startBroadcast(deployer);
        protocolConfig = new ProtocolConfig(
            deployer, feeRecipient, creationFee, minimumLiquidity, useSelfHostedTestAmm
        );

        bool adapterEnabled;
        if (useSelfHostedTestAmm) {
            ammAdapter = IAMMAdapter(address(new GiwaTestnetConstantProductAdapter()));
            adapterEnabled = true;
        } else {
            ammAdapter = IAMMAdapter(
                address(
                    new GiwaV2Adapter(
                        GIWA_SEPOLIA_CHAIN_ID,
                        v2Factory,
                        v2Router,
                        wrappedNative,
                        v2IntegrationApproved
                    )
                )
            );
            adapterEnabled = v2IntegrationApproved;
        }

        launchFactory = new LaunchFactory(protocolConfig);
        if (adapterEnabled) {
            protocolConfig.setAdapterApproval(address(ammAdapter), true);
        }
        vm.stopBroadcast();

        emit GiwaStackDeployed(
            block.chainid,
            address(protocolConfig),
            address(launchFactory),
            address(ammAdapter),
            ammAdapter.adapterId(),
            adapterEnabled,
            ammAdapter.isTestOnly()
        );
    }
}
