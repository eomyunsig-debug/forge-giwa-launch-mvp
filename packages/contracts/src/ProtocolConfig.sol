// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IAMMAdapter } from "./interfaces/IAMMAdapter.sol";
import { ProtocolConstants } from "./lib/ProtocolConstants.sol";

/// @notice Small, non-upgradeable registry for the few mutable protocol settings.
/// @dev The immutable admin can manage future launch fees and adapter admission.
///      It has no authority over launched tokens, creator vaults, or LP lockers.
contract ProtocolConfig {
    error Unauthorized(address caller);
    error ZeroAddress();
    error AddressHasNoCode(address target);
    error FeeTooHigh(uint256 attempted, uint256 maximum);
    error InvalidMinimumLiquidity();
    error AdapterNotConfigured(address adapter);
    error TestAdapterForbidden(address adapter);
    error AdapterStateUnchanged(address adapter, bool enabled);

    address public immutable admin;
    bool public immutable allowTestAdapters;
    uint256 public immutable minimumInitialLiquidity;

    address public feeRecipient;
    uint256 public creationFee;
    mapping(address adapter => bool enabled) public adapterEnabled;

    event CreationFeeUpdated(uint256 previousFee, uint256 newFee);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event AdapterApprovalUpdated(
        address indexed adapter, bytes32 indexed adapterId, bool enabled, bool testOnly
    );

    constructor(
        address admin_,
        address feeRecipient_,
        uint256 creationFee_,
        uint256 minimumInitialLiquidity_,
        bool allowTestAdapters_
    ) {
        if (admin_ == address(0) || feeRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        if (creationFee_ > ProtocolConstants.MAX_CREATION_FEE) {
            revert FeeTooHigh(creationFee_, ProtocolConstants.MAX_CREATION_FEE);
        }
        if (minimumInitialLiquidity_ == 0) revert InvalidMinimumLiquidity();

        admin = admin_;
        feeRecipient = feeRecipient_;
        creationFee = creationFee_;
        minimumInitialLiquidity = minimumInitialLiquidity_;
        allowTestAdapters = allowTestAdapters_;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized(msg.sender);
        _;
    }

    function standardTotalSupply() external pure returns (uint256) {
        return ProtocolConstants.STANDARD_TOTAL_SUPPLY;
    }

    function defaultCreatorAllocationBps() external pure returns (uint16) {
        return ProtocolConstants.DEFAULT_CREATOR_ALLOCATION_BPS;
    }

    function maxCreatorAllocationBps() external pure returns (uint16) {
        return ProtocolConstants.MAX_CREATOR_ALLOCATION_BPS;
    }

    function creatorCliff() external pure returns (uint48) {
        return ProtocolConstants.CREATOR_CLIFF;
    }

    function creatorVestingDuration() external pure returns (uint48) {
        return ProtocolConstants.CREATOR_VESTING_DURATION;
    }

    function maxCreationFee() external pure returns (uint256) {
        return ProtocolConstants.MAX_CREATION_FEE;
    }

    function setCreationFee(uint256 newFee) external onlyAdmin {
        if (newFee > ProtocolConstants.MAX_CREATION_FEE) {
            revert FeeTooHigh(newFee, ProtocolConstants.MAX_CREATION_FEE);
        }
        uint256 previousFee = creationFee;
        creationFee = newFee;
        emit CreationFeeUpdated(previousFee, newFee);
    }

    function setFeeRecipient(address newRecipient) external onlyAdmin {
        if (newRecipient == address(0)) revert ZeroAddress();
        address previousRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previousRecipient, newRecipient);
    }

    function setAdapterApproval(address adapter, bool enabled) external onlyAdmin {
        if (adapterEnabled[adapter] == enabled) {
            revert AdapterStateUnchanged(adapter, enabled);
        }

        bool testOnly;
        bytes32 id;
        if (enabled) {
            if (adapter == address(0)) revert ZeroAddress();
            if (adapter.code.length == 0) revert AddressHasNoCode(adapter);

            try IAMMAdapter(adapter).isConfigured() returns (bool configured) {
                if (!configured) revert AdapterNotConfigured(adapter);
            } catch {
                revert AdapterNotConfigured(adapter);
            }

            try IAMMAdapter(adapter).isTestOnly() returns (bool result) {
                testOnly = result;
            } catch {
                revert AdapterNotConfigured(adapter);
            }
            if (testOnly && !allowTestAdapters) revert TestAdapterForbidden(adapter);

            try IAMMAdapter(adapter).adapterId() returns (bytes32 result) {
                id = result;
            } catch {
                revert AdapterNotConfigured(adapter);
            }
        }

        adapterEnabled[adapter] = enabled;
        emit AdapterApprovalUpdated(adapter, id, enabled, testOnly);
    }
}
