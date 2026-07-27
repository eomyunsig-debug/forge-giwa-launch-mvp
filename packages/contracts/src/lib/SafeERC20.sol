// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "../interfaces/IERC20.sol";

library SafeERC20 {
    error SafeERC20CallFailed(address token, bytes data);

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approval = abi.encodeCall(token.approve, (spender, value));
        (bool success, bytes memory returndata) = address(token).call(approval);
        if (success && (returndata.length == 0 || abi.decode(returndata, (bool)))) return;

        _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
        _callOptionalReturn(token, approval);
    }

    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        (bool success, bytes memory returndata) = address(token).call(data);
        if (
            !success || address(token).code.length == 0
                || (returndata.length != 0 && !abi.decode(returndata, (bool)))
        ) {
            revert SafeERC20CallFailed(address(token), data);
        }
    }
}
