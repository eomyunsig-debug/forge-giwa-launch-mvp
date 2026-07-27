// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface Vm {
    function assume(bool condition) external;
    function deal(address account, uint256 newBalance) external;
    function warp(uint256 newTimestamp) external;
    function roll(uint256 newHeight) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function expectPartialRevert(bytes4 revertData) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData)
        external;
}

struct FuzzSelector {
    address addr;
    bytes4[] selectors;
}

struct FuzzArtifactSelector {
    string artifact;
    bytes4[] selectors;
}

struct FuzzInterface {
    address addr;
    string[] artifacts;
}

abstract contract TestBase {
    error AssertionFailed(string message);

    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool condition) internal pure {
        if (!condition) revert AssertionFailed("expected true");
    }

    function assertFalse(bool condition) internal pure {
        if (condition) revert AssertionFailed("expected false");
    }

    function assertEq(uint256 actual, uint256 expected) internal pure {
        if (actual != expected) revert AssertionFailed("uint values differ");
    }

    function assertEq(address actual, address expected) internal pure {
        if (actual != expected) revert AssertionFailed("address values differ");
    }

    function assertEq(bytes32 actual, bytes32 expected) internal pure {
        if (actual != expected) revert AssertionFailed("bytes32 values differ");
    }

    function assertEq(bool actual, bool expected) internal pure {
        if (actual != expected) revert AssertionFailed("bool values differ");
    }

    function assertGt(uint256 actual, uint256 minimum) internal pure {
        if (actual <= minimum) revert AssertionFailed("expected greater value");
    }

    function assertGe(uint256 actual, uint256 minimum) internal pure {
        if (actual < minimum) revert AssertionFailed("expected greater/equal value");
    }

    function assertLe(uint256 actual, uint256 maximum) internal pure {
        if (actual > maximum) revert AssertionFailed("expected less/equal value");
    }

    function bound(uint256 value, uint256 minimum, uint256 maximum)
        internal
        pure
        returns (uint256)
    {
        if (minimum > maximum) revert AssertionFailed("invalid bound");
        if (value >= minimum && value <= maximum) return value;
        uint256 size = maximum - minimum + 1;
        return minimum + value % size;
    }
}

abstract contract InvariantTestBase is TestBase {
    address[] private _targetContracts;

    function targetContract(address target) internal {
        _targetContracts.push(target);
    }

    function targetContracts() external view returns (address[] memory) {
        return _targetContracts;
    }

    function excludeContracts() external pure returns (address[] memory values) {
        values = new address[](0);
    }

    function targetSenders() external pure returns (address[] memory values) {
        values = new address[](0);
    }

    function excludeSenders() external pure returns (address[] memory values) {
        values = new address[](0);
    }

    function targetArtifacts() external pure returns (string[] memory values) {
        values = new string[](0);
    }

    function excludeArtifacts() external pure returns (string[] memory values) {
        values = new string[](0);
    }

    function targetArtifactSelectors()
        external
        pure
        returns (FuzzArtifactSelector[] memory values)
    {
        values = new FuzzArtifactSelector[](0);
    }

    function targetInterfaces() external pure returns (FuzzInterface[] memory values) {
        values = new FuzzInterface[](0);
    }

    function targetSelectors() external pure returns (FuzzSelector[] memory values) {
        values = new FuzzSelector[](0);
    }

    function excludeSelectors() external pure returns (FuzzSelector[] memory values) {
        values = new FuzzSelector[](0);
    }
}
