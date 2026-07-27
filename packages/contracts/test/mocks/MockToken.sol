// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC20 } from "../../src/lib/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MOCK") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
