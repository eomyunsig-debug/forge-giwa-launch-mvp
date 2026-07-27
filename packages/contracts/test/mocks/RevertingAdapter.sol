// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IAMMAdapter } from "../../src/interfaces/IAMMAdapter.sol";

contract RevertingAdapter is IAMMAdapter {
    error PoolCreationFailed();

    function adapterId() external pure returns (bytes32) {
        return keccak256("REVERTING_TEST_ADAPTER");
    }

    function isTestOnly() external pure returns (bool) {
        return true;
    }

    function isConfigured() external pure returns (bool) {
        return true;
    }

    function createPool(address) external pure returns (address) {
        revert PoolCreationFailed();
    }

    function addInitialLiquidity(address, uint256, uint256, uint256, address)
        external
        payable
        returns (LiquidityPosition memory)
    {
        revert PoolCreationFailed();
    }

    function quoteExactInput(address, bool, uint256) external pure returns (uint256) {
        revert PoolCreationFailed();
    }

    function quoteExactOutput(address, bool, uint256) external pure returns (uint256) {
        revert PoolCreationFailed();
    }

    function buy(address, uint256, uint256, address) external payable returns (uint256) {
        revert PoolCreationFailed();
    }

    function sell(address, uint256, uint256, uint256, address) external pure returns (uint256) {
        revert PoolCreationFailed();
    }

    function liquidityPosition(address) external pure returns (LiquidityPosition memory) {
        revert PoolCreationFailed();
    }

    function getPoolState(address) external pure returns (PoolState memory) {
        revert PoolCreationFailed();
    }
}
