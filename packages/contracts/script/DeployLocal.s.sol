// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { LaunchFactory } from "../src/LaunchFactory.sol";
import { LocalConstantProductAdapter } from "../src/local/LocalConstantProductAdapter.sol";
import { ProtocolConfig } from "../src/ProtocolConfig.sol";
import { ScriptBase } from "./ScriptBase.sol";

contract DeployLocal is ScriptBase {
    uint256 internal constant LOCAL_ANVIL_CHAIN_ID = 31_337;

    error UnsupportedLocalChain(uint256 actualChainId);

    event LocalStackDeployed(
        uint256 indexed chainId,
        address indexed protocolConfig,
        address indexed launchFactory,
        address localAdapter
    );

    function run()
        external
        returns (
            ProtocolConfig protocolConfig,
            LaunchFactory launchFactory,
            LocalConstantProductAdapter localAdapter
        )
    {
        if (block.chainid != LOCAL_ANVIL_CHAIN_ID) {
            revert UnsupportedLocalChain(block.chainid);
        }
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        uint256 creationFee = vm.envOr("CREATION_FEE_WEI", uint256(0.001 ether));
        uint256 minimumLiquidity = vm.envOr("MIN_INITIAL_LIQUIDITY_WEI", uint256(0.01 ether));

        vm.startBroadcast(deployerKey);
        protocolConfig =
            new ProtocolConfig(deployer, feeRecipient, creationFee, minimumLiquidity, true);
        localAdapter = new LocalConstantProductAdapter();
        protocolConfig.setAdapterApproval(address(localAdapter), true);
        launchFactory = new LaunchFactory(protocolConfig);
        vm.stopBroadcast();

        emit LocalStackDeployed(
            block.chainid, address(protocolConfig), address(launchFactory), address(localAdapter)
        );
    }
}
