// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC20 } from "./lib/ERC20.sol";
import { ProtocolConstants } from "./lib/ProtocolConstants.sol";

/// @notice Fixed-supply launch token with no privileged behavior.
/// @dev There is deliberately no owner, mint, burn, pause, blacklist, tax,
///      transfer restriction, proxy, or upgrade entry point.
contract LaunchToken is ERC20 {
    error ZeroAddress();
    error EmptyMetadataURI();
    error EmptyMetadataHash();

    string public metadataURI;
    bytes32 public immutable metadataHash;

    event MetadataCommitted(string metadataURI, bytes32 indexed metadataHash);

    constructor(
        string memory name_,
        string memory symbol_,
        address initialHolder,
        string memory metadataURI_,
        bytes32 metadataHash_
    ) ERC20(name_, symbol_) {
        if (initialHolder == address(0)) revert ZeroAddress();
        if (bytes(metadataURI_).length == 0) revert EmptyMetadataURI();
        if (metadataHash_ == bytes32(0)) revert EmptyMetadataHash();

        metadataURI = metadataURI_;
        metadataHash = metadataHash_;
        _mint(initialHolder, ProtocolConstants.STANDARD_TOTAL_SUPPLY);
        emit MetadataCommitted(metadataURI_, metadataHash_);
    }
}
