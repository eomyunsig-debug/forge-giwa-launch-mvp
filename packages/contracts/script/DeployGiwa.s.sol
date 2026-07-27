// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { GiwaV2Adapter } from "../src/giwa/GiwaV2Adapter.sol";
import { LaunchFactory } from "../src/LaunchFactory.sol";
import { ProtocolConfig } from "../src/ProtocolConfig.sol";
import { ScriptBase } from "./ScriptBase.sol";

/// @notice Deploys a disabled GIWA adapter by default.
/// @dev GIWA_AMM_INTEGRATION_APPROVED must remain false until an authoritative,
///      audited V2-compatible integration and its addresses are independently
///      verified. A disabled adapter cannot be allowlisted.
contract DeployGiwa is ScriptBase {
    uint256 internal constant GIWA_SEPOLIA_CHAIN_ID = 91_342;

    error UnsupportedGiwaChain(uint256 configuredChainId, uint256 actualChainId);

    event GiwaStackDeployed(
        uint256 indexed chainId,
        address indexed protocolConfig,
        address indexed launchFactory,
        address giwaAdapter,
        bool integrationApproved
    );

    function run()
        external
        returns (
            ProtocolConfig protocolConfig,
            LaunchFactory launchFactory,
            GiwaV2Adapter giwaAdapter
        )
    {
        if (block.chainid != GIWA_SEPOLIA_CHAIN_ID) {
            revert UnsupportedGiwaChain(GIWA_SEPOLIA_CHAIN_ID, block.chainid);
        }
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        uint256 creationFee = vm.envOr("CREATION_FEE_WEI", uint256(0));
        uint256 minimumLiquidity = vm.envOr("MIN_INITIAL_LIQUIDITY_WEI", uint256(0.001 ether));

        bool approved = vm.envOr("GIWA_AMM_INTEGRATION_APPROVED", false);
        address v2Factory = vm.envOr("GIWA_V2_FACTORY", address(0));
        address v2Router = vm.envOr("GIWA_V2_ROUTER", address(0));
        address wrappedNative = vm.envOr("GIWA_WRAPPED_NATIVE", address(0));

        vm.startBroadcast(deployerKey);
        protocolConfig =
            new ProtocolConfig(deployer, feeRecipient, creationFee, minimumLiquidity, false);
        giwaAdapter =
            new GiwaV2Adapter(GIWA_SEPOLIA_CHAIN_ID, v2Factory, v2Router, wrappedNative, approved);
        launchFactory = new LaunchFactory(protocolConfig);
        if (approved) {
            protocolConfig.setAdapterApproval(address(giwaAdapter), true);
        }
        vm.stopBroadcast();

        emit GiwaStackDeployed(
            block.chainid,
            address(protocolConfig),
            address(launchFactory),
            address(giwaAdapter),
            approved
        );
    }
}
