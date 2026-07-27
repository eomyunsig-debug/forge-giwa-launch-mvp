// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "./interfaces/IERC20.sol";

/// @notice Holds one ERC-20 LP position without any principal withdrawal path.
/// @dev There is deliberately no admin, emergency withdrawal, arbitrary call,
///      approval, or transfer function.
contract PermanentLiquidityLocker {
    error Unauthorized(address caller);
    error ZeroAddress();
    error AlreadyInitialized();
    error ZeroPrincipal();
    error PrincipalNotReceived(uint256 expected, uint256 actual);

    address public immutable launchFactory;
    address public adapter;
    address public pool;
    IERC20 public positionAsset;
    uint256 public positionId;
    uint256 public principalAmount;
    bool public initialized;

    event LiquidityPermanentlyLocked(
        address indexed adapter,
        address indexed pool,
        address indexed positionAsset,
        uint256 positionId,
        uint256 principalAmount
    );

    constructor(address launchFactory_) {
        if (launchFactory_ == address(0)) revert ZeroAddress();
        launchFactory = launchFactory_;
    }

    function initialize(
        address adapter_,
        address pool_,
        IERC20 positionAsset_,
        uint256 positionId_,
        uint256 principalAmount_
    ) external {
        if (msg.sender != launchFactory) revert Unauthorized(msg.sender);
        if (initialized) revert AlreadyInitialized();
        if (adapter_ == address(0) || pool_ == address(0) || address(positionAsset_) == address(0))
        {
            revert ZeroAddress();
        }
        if (principalAmount_ == 0) revert ZeroPrincipal();

        uint256 actualBalance = positionAsset_.balanceOf(address(this));
        if (actualBalance < principalAmount_) {
            revert PrincipalNotReceived(principalAmount_, actualBalance);
        }

        initialized = true;
        adapter = adapter_;
        pool = pool_;
        positionAsset = positionAsset_;
        positionId = positionId_;
        principalAmount = principalAmount_;

        emit LiquidityPermanentlyLocked(
            adapter_, pool_, address(positionAsset_), positionId_, principalAmount_
        );
    }

    function currentPrincipalBalance() external view returns (uint256) {
        if (!initialized) return 0;
        return positionAsset.balanceOf(address(this));
    }

    function principalIntact() external view returns (bool) {
        return initialized && positionAsset.balanceOf(address(this)) >= principalAmount;
    }
}
