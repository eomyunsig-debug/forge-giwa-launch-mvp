// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { CreatorVestingVault } from "./CreatorVestingVault.sol";
import { IAMMAdapter } from "./interfaces/IAMMAdapter.sol";
import { IERC20 } from "./interfaces/IERC20.sol";
import { LaunchToken } from "./LaunchToken.sol";
import { PermanentLiquidityLocker } from "./PermanentLiquidityLocker.sol";
import { ProtocolConfig } from "./ProtocolConfig.sol";
import { ProtocolConstants } from "./lib/ProtocolConstants.sol";
import { ReentrancyGuard } from "./lib/ReentrancyGuard.sol";
import { SafeERC20 } from "./lib/SafeERC20.sol";

/// @notice Atomic token, vesting, pool, initial-liquidity, and LP-lock launcher.
contract LaunchFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct LaunchRequest {
        string name;
        string symbol;
        string metadataURI;
        bytes32 metadataHash;
        uint16 creatorAllocationBps;
        uint256 initialNativeLiquidity;
        uint256 minLiquidityTokens;
        uint256 deadline;
        address adapter;
    }

    struct LaunchRecord {
        address token;
        address creator;
        address vestingVault;
        address liquidityLocker;
        address adapter;
        address pool;
        address lpAsset;
        uint256 lpPositionId;
        uint256 lpPrincipal;
        uint256 creatorAllocation;
        uint256 initialTokenLiquidity;
        uint256 initialNativeLiquidity;
        uint256 creationFeePaid;
        uint16 creatorAllocationBps;
        uint48 createdAt;
        bytes32 metadataHash;
    }

    error ZeroAddress();
    error AddressHasNoCode(address target);
    error InvalidNameLength(uint256 length);
    error InvalidSymbolLength(uint256 length);
    error InvalidSymbolCharacter(uint256 index, bytes1 character);
    error InvalidMetadataURILength(uint256 length);
    error EmptyMetadataHash();
    error CreatorAllocationTooHigh(uint16 attempted, uint16 maximum);
    error InitialLiquidityTooLow(uint256 attempted, uint256 minimum);
    error AdapterNotApproved(address adapter);
    error AdapterNotConfigured(address adapter);
    error IncorrectNativeValue(uint256 expected, uint256 actual);
    error InvalidDeadline(uint256 deadline, uint256 earliest, uint256 latest);
    error InvalidLiquidityPosition();
    error UnexpectedFactoryTokenBalance(uint256 balance);
    error UnauthorizedFeeWithdrawal(address caller);
    error InvalidFeeWithdrawal(uint256 requested, uint256 available);
    error NativeTransferFailed(address recipient, uint256 amount);
    error DirectNativeTransferForbidden();

    ProtocolConfig public immutable config;
    uint256 public launchCount;
    uint256 public totalCreationFeesAccrued;
    uint256 public totalCreationFeesWithdrawn;
    mapping(uint256 launchId => LaunchRecord record) public launches;
    mapping(address token => uint256 launchId) public launchIdByToken;

    event LaunchCreated(
        uint256 indexed launchId,
        address indexed token,
        address indexed creator,
        address vestingVault,
        address liquidityLocker,
        address adapter,
        address pool,
        address lpAsset,
        uint256 lpPositionId,
        uint256 lpPrincipal,
        uint16 creatorAllocationBps,
        uint256 creatorAllocation,
        uint256 initialTokenLiquidity,
        uint256 initialNativeLiquidity,
        uint256 creationFeePaid,
        bytes32 metadataHash,
        string metadataURI
    );
    event CreationFeeAccrued(
        uint256 indexed launchId, address indexed payer, uint256 amount, uint256 totalAccrued
    );
    event CreationFeesWithdrawn(address indexed recipient, uint256 amount, uint256 totalWithdrawn);

    constructor(ProtocolConfig config_) {
        if (address(config_) == address(0)) revert ZeroAddress();
        if (address(config_).code.length == 0) revert AddressHasNoCode(address(config_));
        config = config_;
    }

    function launch(LaunchRequest calldata request)
        external
        payable
        nonReentrant
        returns (uint256 launchId, LaunchRecord memory record)
    {
        _validateRequest(request);

        uint256 creationFee = config.creationFee();
        uint256 expectedValue = creationFee + request.initialNativeLiquidity;
        if (msg.value != expectedValue) revert IncorrectNativeValue(expectedValue, msg.value);

        uint256 creatorAllocation = ProtocolConstants.STANDARD_TOTAL_SUPPLY
            * request.creatorAllocationBps / ProtocolConstants.BPS_DENOMINATOR;
        uint256 tokenLiquidity = ProtocolConstants.STANDARD_TOTAL_SUPPLY - creatorAllocation;
        uint48 start = uint48(block.timestamp);

        LaunchToken token = new LaunchToken(
            request.name, request.symbol, address(this), request.metadataURI, request.metadataHash
        );
        CreatorVestingVault vestingVault = new CreatorVestingVault(
            IERC20(address(token)),
            msg.sender,
            creatorAllocation,
            start,
            start + ProtocolConstants.CREATOR_CLIFF,
            start + ProtocolConstants.CREATOR_VESTING_DURATION
        );
        PermanentLiquidityLocker liquidityLocker = new PermanentLiquidityLocker(address(this));

        if (creatorAllocation != 0) {
            IERC20(address(token)).safeTransfer(address(vestingVault), creatorAllocation);
        }

        IAMMAdapter adapter = IAMMAdapter(request.adapter);
        address pool = adapter.createPool(address(token));
        IERC20(address(token)).forceApprove(request.adapter, tokenLiquidity);
        IAMMAdapter.LiquidityPosition memory position = adapter.addInitialLiquidity{
            value: request.initialNativeLiquidity
        }(
            address(token),
            tokenLiquidity,
            request.minLiquidityTokens,
            request.deadline,
            address(liquidityLocker)
        );
        IERC20(address(token)).forceApprove(request.adapter, 0);

        if (
            pool == address(0) || position.pool != pool || position.asset == address(0)
                || position.principal == 0 || pool.code.length == 0
                || position.asset.code.length == 0
        ) {
            revert InvalidLiquidityPosition();
        }
        uint256 factoryTokenBalance = token.balanceOf(address(this));
        if (factoryTokenBalance != 0) {
            revert UnexpectedFactoryTokenBalance(factoryTokenBalance);
        }

        liquidityLocker.initialize(
            request.adapter, pool, IERC20(position.asset), position.positionId, position.principal
        );

        launchId = ++launchCount;
        totalCreationFeesAccrued += creationFee;
        record = LaunchRecord({
            token: address(token),
            creator: msg.sender,
            vestingVault: address(vestingVault),
            liquidityLocker: address(liquidityLocker),
            adapter: request.adapter,
            pool: pool,
            lpAsset: position.asset,
            lpPositionId: position.positionId,
            lpPrincipal: position.principal,
            creatorAllocation: creatorAllocation,
            initialTokenLiquidity: tokenLiquidity,
            initialNativeLiquidity: request.initialNativeLiquidity,
            creationFeePaid: creationFee,
            creatorAllocationBps: request.creatorAllocationBps,
            createdAt: start,
            metadataHash: request.metadataHash
        });
        launches[launchId] = record;
        launchIdByToken[address(token)] = launchId;

        emit CreationFeeAccrued(launchId, msg.sender, creationFee, totalCreationFeesAccrued);
        emit LaunchCreated(
            launchId,
            address(token),
            msg.sender,
            address(vestingVault),
            address(liquidityLocker),
            request.adapter,
            pool,
            position.asset,
            position.positionId,
            position.principal,
            request.creatorAllocationBps,
            creatorAllocation,
            tokenLiquidity,
            request.initialNativeLiquidity,
            creationFee,
            request.metadataHash,
            request.metadataURI
        );
    }

    function availableCreationFees() public view returns (uint256) {
        return totalCreationFeesAccrued - totalCreationFeesWithdrawn;
    }

    /// @notice Native value that was force-sent and is not protocol fee revenue.
    /// @dev It is intentionally not withdrawable through the creation-fee path.
    function unaccountedNativeBalance() external view returns (uint256) {
        uint256 accounted = availableCreationFees();
        uint256 balance = address(this).balance;
        return balance > accounted ? balance - accounted : 0;
    }

    function withdrawCreationFees(uint256 amount) external nonReentrant {
        address recipient = config.feeRecipient();
        if (msg.sender != recipient) revert UnauthorizedFeeWithdrawal(msg.sender);

        uint256 available = availableCreationFees();
        if (amount == 0 || amount > available) revert InvalidFeeWithdrawal(amount, available);

        totalCreationFeesWithdrawn += amount;
        (bool success,) = recipient.call{ value: amount }("");
        if (!success) revert NativeTransferFailed(recipient, amount);
        emit CreationFeesWithdrawn(recipient, amount, totalCreationFeesWithdrawn);
    }

    function _validateRequest(LaunchRequest calldata request) private view {
        uint256 nameLength = bytes(request.name).length;
        if (nameLength == 0 || nameLength > ProtocolConstants.MAX_NAME_BYTES) {
            revert InvalidNameLength(nameLength);
        }
        _validateSymbol(request.symbol);

        uint256 metadataLength = bytes(request.metadataURI).length;
        if (metadataLength == 0 || metadataLength > ProtocolConstants.MAX_METADATA_URI_BYTES) {
            revert InvalidMetadataURILength(metadataLength);
        }
        if (request.metadataHash == bytes32(0)) revert EmptyMetadataHash();

        if (request.creatorAllocationBps > ProtocolConstants.MAX_CREATOR_ALLOCATION_BPS) {
            revert CreatorAllocationTooHigh(
                request.creatorAllocationBps, ProtocolConstants.MAX_CREATOR_ALLOCATION_BPS
            );
        }

        uint256 minimumLiquidity = config.minimumInitialLiquidity();
        if (request.initialNativeLiquidity < minimumLiquidity) {
            revert InitialLiquidityTooLow(request.initialNativeLiquidity, minimumLiquidity);
        }

        if (request.adapter == address(0)) revert ZeroAddress();
        if (request.adapter.code.length == 0) revert AddressHasNoCode(request.adapter);
        if (!config.adapterEnabled(request.adapter)) revert AdapterNotApproved(request.adapter);
        try IAMMAdapter(request.adapter).isConfigured() returns (bool configured) {
            if (!configured) revert AdapterNotConfigured(request.adapter);
        } catch {
            revert AdapterNotConfigured(request.adapter);
        }

        uint256 latestDeadline = block.timestamp + ProtocolConstants.MAX_TRANSACTION_DEADLINE_WINDOW;
        // forge-lint: disable-next-line(block-timestamp)
        if (request.deadline < block.timestamp || request.deadline > latestDeadline) {
            revert InvalidDeadline(request.deadline, block.timestamp, latestDeadline);
        }
    }

    function _validateSymbol(string calldata symbol) private pure {
        bytes calldata characters = bytes(symbol);
        uint256 length = characters.length;
        if (
            length < ProtocolConstants.MIN_SYMBOL_BYTES
                || length > ProtocolConstants.MAX_SYMBOL_BYTES
        ) {
            revert InvalidSymbolLength(length);
        }

        for (uint256 index; index < length; ++index) {
            bytes1 character = characters[index];
            bool isUppercaseLetter = character >= 0x41 && character <= 0x5A;
            bool isDigit = character >= 0x30 && character <= 0x39;
            if (
                (index == 0 && !isUppercaseLetter) || (index != 0 && !isUppercaseLetter && !isDigit)
            ) {
                revert InvalidSymbolCharacter(index, character);
            }
        }
    }

    receive() external payable {
        revert DirectNativeTransferForbidden();
    }

    fallback() external payable {
        revert DirectNativeTransferForbidden();
    }
}
