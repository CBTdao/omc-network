// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PropTest} from "./Vm.sol";
import {OMCTestToken} from "../OMCTestToken.sol";
import {OMCStaking} from "../OMCStaking.sol";

/// @title property tests for OMCStaking.sol
contract StakingPropsTest is PropTest {
    OMCTestToken token;
    OMCStaking staking;

    address constant NODE = address(0x1402);
    address constant TREASURY = address(0x7A5);
    address constant POOL = address(0xF00D);

    function setUp() public {
        token = new OMCTestToken(address(this));
        staking = new OMCStaking(address(token), TREASURY, POOL);
        token.approve(address(staking), type(uint256).max);
    }

    function _stakeAndRegister(uint256 amount, uint8 tier) internal {
        staking.stake(amount, tier);
        staking.registerNode(tier, "http://node.local");
    }

    /// @dev pulls the node's stake out of the public mapping getter
    function _nodeStake(address who) internal view returns (uint256 s) {
        (, , , s, , , , , , , ) = staking.node(who);
    }

    function _nodeEarning(address who) internal view returns (bool e) {
        (, , e, , , , , , , , ) = staking.node(who);
    }

    /* ---------------- published rule 5: the APR ceiling ------------------ */

    /// @dev the headline promise of the ceiling: whatever the stake size is and
    ///      whatever the dial is set to, the annualised rate actually in force
    ///      can never imply more than `maxAprBps`.
    function testFuzz_impliedAprNeverExceedsPublishedCeiling(
        uint96 rawStake,
        uint16 rawApr
    ) public {
        uint256 stakeAmt = bound(uint256(rawStake), 20e18, 5_000_000e18);
        uint256 apr = bound(uint256(rawApr), 1, 10_000);

        staking.setMaxAprBps(apr);
        _stakeAndRegister(stakeAmt, 1);

        assertEq(staking.totalStake(), stakeAmt, "totalStake mismatch");

        uint256 rate = staking.effectiveEmissionPerSecond();
        uint256 impliedBps = (rate * staking.SECONDS_PER_YEAR() * staking.BPS()) / stakeAmt;

        assertLe(impliedBps, apr, "implied APR exceeded the published ceiling");
    }

    /// @dev the ceiling only ever reduces emission; it never raises it above the
    ///      10-year schedule
    function testFuzz_rateNeverExceedsSchedule(uint96 rawStake, uint16 rawApr) public {
        uint256 stakeAmt = bound(uint256(rawStake), 0, 5_000_000e18);
        uint256 apr = bound(uint256(rawApr), 1, 10_000);

        staking.setMaxAprBps(apr);
        if (stakeAmt >= 20e18) {
            _stakeAndRegister(stakeAmt, 1);
        }

        uint256 rate = staking.effectiveEmissionPerSecond();
        assertLe(rate, staking.emissionPerSecond(), "rate above the published schedule");

        if (stakeAmt == 0) {
            assertEq(rate, 0, "no stake must mean no quoted rate");
        }
    }

    /// @dev as stake grows past the crossover the schedule takes over on its own,
    ///      which is why the cap needs no oracle
    function testFuzz_scheduleTakesOverAtScale(uint96 rawStake) public {
        uint256 stakeAmt = bound(uint256(rawStake), 20e18, 5_000_000e18);
        staking.setMaxAprBps(2_000); // 20%
        _stakeAndRegister(stakeAmt, 1);

        (, string memory cappedBy) = staking.emissionConstraint();
        uint256 crossover = (staking.emissionPerSecond() * staking.BPS() * staking.SECONDS_PER_YEAR()) /
            staking.maxAprBps();

        // stay clear of the boundary so integer truncation cannot flip the answer
        if (stakeAmt > crossover + 1e18) {
            assertEq(keccak256(bytes(cappedBy)), keccak256("schedule"), "should be schedule-bound");
        } else if (stakeAmt + 1e18 < crossover) {
            assertEq(keccak256(bytes(cappedBy)), keccak256("apr"), "should be apr-bound");
        }
    }

    /// @dev the dial is bounded to (0, BPS] so it cannot be switched off
    function test_setMaxAprBps_rejectsOutOfRange() public {
        assertReverts(
            address(staking),
            abi.encodeWithSelector(OMCStaking.setMaxAprBps.selector, 0),
            "zero ceiling accepted"
        );
        assertReverts(
            address(staking),
            abi.encodeWithSelector(OMCStaking.setMaxAprBps.selector, 10_001),
            "ceiling above 100% accepted"
        );
        staking.setMaxAprBps(10_000);
        assertEq(staking.maxAprBps(), 10_000, "valid ceiling rejected");
    }

    /* ---------------------------- solvency ------------------------------- */

    /// @dev staked principal must always be covered by the contract's balance,
    ///      no matter the stake size, the funding of the reward pool, or how long
    ///      the node then goes dark. This is asserted after every step of a
    ///      fuzzed sequence rather than only at the end.
    function testFuzz_contractAlwaysCoversStakedPrincipal(
        uint96 rawStake,
        uint96 rawFund,
        uint32 rawDt
    ) public {
        uint256 stakeAmt = bound(uint256(rawStake), 20e18, 1_000_000e18);
        uint256 fundAmt = bound(uint256(rawFund), 0, 500_000e18);
        uint256 dt = bound(uint256(rawDt), 0, 30 days);

        _stakeAndRegister(stakeAmt, 1);
        _assertCovered("after register");

        if (fundAmt > 0) {
            staking.fundRewards(fundAmt);
            _assertCovered("after fundRewards");
        }

        vm.warp(block.timestamp + dt);

        // claim is allowed to revert with "reward pool empty"
        vm.prank(NODE);
        (bool ok, ) = address(staking).call(abi.encodeWithSelector(OMCStaking.claim.selector));
        ok;
        _assertCovered("after claim");

        vm.prank(NODE);
        staking.heartbeat();
        _assertCovered("after heartbeat (which may slash)");

        vm.prank(NODE);
        staking.deregister();
        _assertCovered("after deregister");

        uint256 held = _nodeStake(NODE);
        vm.prank(NODE);
        staking.unstake(held);
        _assertCovered("after unstake");
    }

    function _assertCovered(string memory step) internal view {
        assertGe(
            token.balanceOf(address(staking)),
            staking.totalStake(),
            string.concat("contract no longer covers staked principal ", step)
        );
    }

    /// @dev the exit path in full, with no elapsed time: heartbeat -> deregister
    ///      -> unstake. A registered node can never unstake below its tier
    ///      minimum, so deregistering first is mandatory, not optional.
    function test_exitPath_requiresDeregisterFirst() public {
        uint256 stakeAmt = 100e18;
        _stakeAndRegister(stakeAmt, 1);

        assertRevertsAs(
            NODE,
            address(staking),
            abi.encodeWithSelector(OMCStaking.unstake.selector, stakeAmt),
            "registered node unstaked below its tier minimum"
        );

        vm.prank(NODE);
        staking.deregister();

        vm.prank(NODE);
        staking.unstake(stakeAmt);

        assertEq(staking.totalStake(), 0, "totalStake not cleared after full exit");
        assertEq(_nodeStake(NODE), 0, "node kept stake after full exit");
        assertGe(token.balanceOf(NODE), stakeAmt, "node did not get its principal back");
    }

    /* ------------------------- the published ladder ---------------------- */

    /// @dev the ladder is a fixed 5-step table, not a formula, and the market
    ///      reads it back from here so there is one source of truth
    function test_ladder_isExactlyFiveFixedSteps() public view {
        assertEq(staking.TIER_COUNT(), 5, "tier count");
        assertEq(staking.minStakeForTier(1), 20e18, "T1");
        assertEq(staking.minStakeForTier(2), 100e18, "T2");
        assertEq(staking.minStakeForTier(3), 500e18, "T3");
        assertEq(staking.minStakeForTier(4), 1_000e18, "T4");
        assertEq(staking.minStakeForTier(5), 5_000e18, "T5");
    }

    /// @dev unlike the market's passthrough, this one reverts on a bad tier, so
    ///      callers must range-check before calling. Asserted so the asymmetry
    ///      cannot change silently.
    function testFuzz_minStakeForTier_revertsOutsideRange(uint8 tier) public {
        if (tier >= 1 && tier <= 5) {
            assertGt(staking.minStakeForTier(tier), 0, "valid tier returned zero");
        } else {
            assertReverts(
                address(staking),
                abi.encodeWithSelector(OMCStaking.minStakeForTier.selector, tier),
                "invalid tier did not revert"
            );
        }
    }

    /* --------------------------- slashing -------------------------------- */

    /// @dev however long a node is dark, the slash can never take more than the
    ///      whole bond, and the node's stake accounting can never underflow
    function testFuzz_overdueSlashCappedAtWholeBond(uint32 rawElapsed) public {
        uint256 stakeAmt = 100e18;
        _stakeAndRegister(stakeAmt, 1);

        uint256 elapsed = bound(uint256(rawElapsed), 41 minutes, 3650 days);
        vm.warp(block.timestamp + elapsed);
        assertTrue(staking.isOverdue(NODE), "node should be overdue at this age");

        assertRevertsAs(
            NODE,
            address(staking),
            abi.encodeWithSelector(OMCStaking.unstake.selector, 1e18),
            "overdue node escaped with its stake"
        );

        vm.prank(NODE);
        staking.heartbeat();

        assertLe(_nodeStake(NODE), stakeAmt, "slash exceeded the bond");
        assertFalse(staking.isOverdue(NODE), "still overdue right after a heartbeat");
        assertGe(
            token.balanceOf(address(staking)),
            staking.totalStake(),
            "contract no longer covers staked principal after a slash"
        );
    }

    /// @dev the heartbeat window is interval + grace
    function test_heartbeatWindow_isIntervalPlusGrace() public {
        _stakeAndRegister(100e18, 1);
        uint256 hb = block.timestamp;
        assertEq(
            staking.heartbeatDeadline(NODE),
            hb + staking.heartbeatInterval() + staking.heartbeatGrace(),
            "deadline"
        );
    }
}
