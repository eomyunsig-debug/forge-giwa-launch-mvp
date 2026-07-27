// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library ProtocolConstants {
    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint256 internal constant STANDARD_TOTAL_SUPPLY = 1_000_000_000 ether;
    uint16 internal constant DEFAULT_CREATOR_ALLOCATION_BPS = 500;
    uint16 internal constant MAX_CREATOR_ALLOCATION_BPS = 1000;
    uint48 internal constant CREATOR_CLIFF = 1 days;
    uint48 internal constant CREATOR_VESTING_DURATION = 30 days;
    uint48 internal constant MAX_TRANSACTION_DEADLINE_WINDOW = 1 hours;
    uint256 internal constant MAX_CREATION_FEE = 10 ether;
    uint16 internal constant LOCAL_SWAP_FEE_BPS = 30;

    uint256 internal constant MAX_NAME_BYTES = 64;
    uint256 internal constant MIN_SYMBOL_BYTES = 2;
    uint256 internal constant MAX_SYMBOL_BYTES = 10;
    uint256 internal constant MAX_METADATA_URI_BYTES = 256;
}
