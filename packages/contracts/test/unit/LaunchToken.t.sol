// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { LaunchToken } from "../../src/LaunchToken.sol";
import { TestBase } from "../TestBase.sol";

contract LaunchTokenTest is TestBase {
    uint256 private constant SUPPLY = 1_000_000_000 ether;
    address private constant HOLDER = address(0xA11CE);
    address private constant RECEIVER = address(0xB0B);

    LaunchToken private token;

    function setUp() external {
        token = new LaunchToken(
            "Community Forge", "CF01", HOLDER, "ipfs://metadata", keccak256("metadata")
        );
    }

    function testFixedSupplyAndMetadataCommitment() external view {
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(HOLDER), SUPPLY);
        assertEq(token.decimals(), 18);
        assertEq(token.metadataHash(), keccak256("metadata"));
    }

    function testTransferHasNoTax() external {
        vm.prank(HOLDER);
        assertTrue(token.transfer(RECEIVER, 100 ether));

        assertEq(token.balanceOf(RECEIVER), 100 ether);
        assertEq(token.balanceOf(HOLDER), SUPPLY - 100 ether);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testNoExternalMintBurnPauseBlacklistOrTaxSurface() external {
        (bool mintSuccess,) =
            address(token).call(abi.encodeWithSignature("mint(address,uint256)", HOLDER, 1 ether));
        (bool burnSuccess,) = address(token).call(abi.encodeWithSignature("burn(uint256)", 1 ether));
        (bool pauseSuccess,) = address(token).call(abi.encodeWithSignature("pause()"));
        (bool blacklistSuccess,) =
            address(token).call(abi.encodeWithSignature("setBlacklist(address,bool)", HOLDER, true));
        (bool taxSuccess,) = address(token).call(abi.encodeWithSignature("setTax(uint256)", 100));

        assertFalse(mintSuccess);
        assertFalse(burnSuccess);
        assertFalse(pauseSuccess);
        assertFalse(blacklistSuccess);
        assertFalse(taxSuccess);
        assertEq(token.totalSupply(), SUPPLY);
    }
}
