// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20Metadata } from "../interfaces/IERC20.sol";

abstract contract ERC20 is IERC20Metadata {
    error ERC20InvalidSender(address sender);
    error ERC20InvalidReceiver(address receiver);
    error ERC20InvalidApprover(address approver);
    error ERC20InvalidSpender(address spender);
    error ERC20InsufficientBalance(address account, uint256 balance, uint256 needed);
    error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);

    string private _name;
    string private _symbol;
    uint256 private _totalSupply;
    mapping(address account => uint256) private _balances;
    mapping(address owner => mapping(address spender => uint256)) private _allowances;

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    function name() public view virtual returns (string memory) {
        return _name;
    }

    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }

    function decimals() public pure virtual returns (uint8) {
        return 18;
    }

    function totalSupply() public view virtual returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 value) public virtual returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function allowance(address owner, address spender) public view virtual returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 value) public virtual returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public virtual returns (bool) {
        uint256 currentAllowance = allowance(from, msg.sender);
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < value) {
                revert ERC20InsufficientAllowance(msg.sender, currentAllowance, value);
            }
            unchecked {
                _approve(from, msg.sender, currentAllowance - value);
            }
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal virtual {
        if (from == address(0)) revert ERC20InvalidSender(address(0));
        if (to == address(0)) revert ERC20InvalidReceiver(address(0));

        uint256 fromBalance = _balances[from];
        if (fromBalance < value) {
            revert ERC20InsufficientBalance(from, fromBalance, value);
        }
        unchecked {
            _balances[from] = fromBalance - value;
            _balances[to] += value;
        }
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal virtual {
        if (to == address(0)) revert ERC20InvalidReceiver(address(0));
        _totalSupply += value;
        unchecked {
            _balances[to] += value;
        }
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal virtual {
        if (from == address(0)) revert ERC20InvalidSender(address(0));
        uint256 fromBalance = _balances[from];
        if (fromBalance < value) {
            revert ERC20InsufficientBalance(from, fromBalance, value);
        }
        unchecked {
            _balances[from] = fromBalance - value;
            _totalSupply -= value;
        }
        emit Transfer(from, address(0), value);
    }

    function _approve(address owner, address spender, uint256 value) internal virtual {
        if (owner == address(0)) revert ERC20InvalidApprover(address(0));
        if (spender == address(0)) revert ERC20InvalidSpender(address(0));
        _allowances[owner][spender] = value;
        emit Approval(owner, spender, value);
    }
}
