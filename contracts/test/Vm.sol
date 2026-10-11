// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Minimal Foundry cheatcode surface.
 *
 * forge-std is intentionally not vendored here: the contracts under test import
 * nothing, and the harness keeps that property so the whole suite can be
 * compiled from a bare checkout with no submodules.
 */
interface Vm {
    function warp(uint256 newTimestamp) external;
    function roll(uint256 newHeight) external;
    function prank(address msgSender) external;
    function startPrank(address msgSender) external;
    function stopPrank() external;
    function deal(address account, uint256 newBalance) external;
    function assume(bool condition) external;
    function label(address account, string calldata newLabel) external;
}

/**
 * Minimal assertion helpers. A failing assertion reverts, which is how forge
 * detects a failed test — no dependency on DSTest/forge-std is required.
 */
abstract contract PropTest {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    /* ----------------------------- assertions --------------------------- */

    function assertTrue(bool v, string memory what) internal pure {
        require(v, what);
    }

    function assertFalse(bool v, string memory what) internal pure {
        require(!v, what);
    }

    function assertEq(uint256 a, uint256 b, string memory what) internal pure {
        require(a == b, what);
    }

    function assertEq(address a, address b, string memory what) internal pure {
        require(a == b, what);
    }

    function assertEq(bytes32 a, bytes32 b, string memory what) internal pure {
        require(a == b, what);
    }

    function assertLe(uint256 a, uint256 b, string memory what) internal pure {
        require(a <= b, what);
    }

    function assertLt(uint256 a, uint256 b, string memory what) internal pure {
        require(a < b, what);
    }

    function assertGe(uint256 a, uint256 b, string memory what) internal pure {
        require(a >= b, what);
    }

    function assertGt(uint256 a, uint256 b, string memory what) internal pure {
        require(a > b, what);
    }

    /// @dev a call that is *required* to revert (access control, bounds, ...)
    function assertReverts(address target, bytes memory callData, string memory what) internal {
        (bool ok, ) = target.call(callData);
        require(!ok, what);
    }

    /// @dev a call that is *required* to revert, issued as `who`
    function assertRevertsAs(
        address who,
        address target,
        bytes memory callData,
        string memory what
    ) internal {
        vm.prank(who);
        (bool ok, ) = target.call(callData);
        require(!ok, what);
    }

    /* ------------------------------- helpers ---------------------------- */

    /// @dev clamp an arbitrary fuzz input into [lo, hi]
    function bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        if (hi < lo) {
            (lo, hi) = (hi, lo);
        }
        if (x < lo) return lo;
        if (x > hi) return lo + (x % (hi - lo + 1));
        return x;
    }
}
