// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ScriptVm {
    function envUint(string calldata name) external returns (uint256 value);
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256 value);
    function envOr(string calldata name, address defaultValue) external returns (address value);
    function envOr(string calldata name, bool defaultValue) external returns (bool value);
    function addr(uint256 privateKey) external returns (address keyAddr);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract ScriptBase {
    ScriptVm internal constant vm =
        ScriptVm(address(uint160(uint256(keccak256("hevm cheat code")))));
}
