// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "./interfaces/IERC20.sol";
import { ReentrancyGuard } from "./lib/ReentrancyGuard.sol";
import { SafeERC20 } from "./lib/SafeERC20.sol";

/// @notice Immutable, single-launch creator vesting schedule.
contract CreatorVestingVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InvalidSchedule(uint48 start, uint48 cliff, uint48 end);
    error NothingToClaim();

    IERC20 public immutable token;
    address public immutable creator;
    uint256 public immutable totalAllocation;
    uint48 public immutable start;
    uint48 public immutable cliff;
    uint48 public immutable end;
    uint256 public released;

    event CreatorTokensClaimed(
        address indexed creator, address indexed token, uint256 amount, uint256 totalReleased
    );

    constructor(
        IERC20 token_,
        address creator_,
        uint256 totalAllocation_,
        uint48 start_,
        uint48 cliff_,
        uint48 end_
    ) {
        if (address(token_) == address(0) || creator_ == address(0)) {
            revert ZeroAddress();
        }
        if (start_ > cliff_ || cliff_ >= end_) revert InvalidSchedule(start_, cliff_, end_);

        token = token_;
        creator = creator_;
        totalAllocation = totalAllocation_;
        start = start_;
        cliff = cliff_;
        end = end_;
    }

    function vestedAmount() public view returns (uint256) {
        return vestedAmountAt(uint48(block.timestamp));
    }

    function vestedAmountAt(uint48 timestamp) public view returns (uint256) {
        if (timestamp < cliff) return 0;
        if (timestamp >= end) return totalAllocation;
        return totalAllocation * (timestamp - start) / (end - start);
    }

    function claimable() public view returns (uint256) {
        return vestedAmount() - released;
    }

    function lockedAmount() external view returns (uint256) {
        return totalAllocation - vestedAmount();
    }

    function remainingAllocation() external view returns (uint256) {
        return totalAllocation - released;
    }

    function claim() external nonReentrant returns (uint256 amount) {
        amount = claimable();
        if (amount == 0) revert NothingToClaim();

        released += amount;
        token.safeTransfer(creator, amount);
        emit CreatorTokensClaimed(creator, address(token), amount, released);
    }
}
