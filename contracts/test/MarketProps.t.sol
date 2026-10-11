// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PropTest} from "./Vm.sol";
import {OMCTestToken} from "../OMCTestToken.sol";
import {OMCStaking} from "../OMCStaking.sol";
import {OMCComputeMarket} from "../OMCComputeMarket.sol";

/// @dev read-only view of the job struct, so the tests can inspect state without
///      importing the contract's own nested types
interface IMarketReads {
    function job(uint256)
        external
        view
        returns (
            address requester,
            address provider,
            uint8 hardwareTier,
            uint8 verifyPolicy,
            uint8 protection,
            uint8 state,
            uint256 maxPrice,
            uint256 paid,
            uint256 feePaid,
            uint64 createdAt,
            uint64 deadline,
            uint64 deliveredAt,
            bool paidInOMC,
            bytes32 specHash,
            bytes32 resultHash
        );

    function totalEscrowed() external view returns (uint256);
    function assignedJobCount() external view returns (uint256);
    function settledJobs() external view returns (uint256);
    function failedJobs() external view returns (uint256);
}

/// @title property tests for OMCComputeMarket.sol
contract MarketPropsTest is PropTest {
    OMCTestToken token;
    OMCStaking staking;
    OMCComputeMarket market;
    IMarketReads reads;

    address constant PROVIDER = address(0xB0B);
    address constant REQ = address(0xCAFE);
    address constant TREASURY = address(0x7A5);
    address constant POOL = address(0xF00D);
    address constant SINK = address(0xDEAD);

    bytes32 constant SPEC = keccak256("omc.spec");
    bytes32 constant RESULT = keccak256("omc.result");

    /// @dev JobState.SETTLED / REFUNDED / CANCELLED, mirrored from the enum order
    uint8 constant ST_SETTLED = 4;
    uint8 constant ST_REFUNDED = 6;
    uint8 constant ST_CANCELLED = 7;

    function setUp() public {
        token = new OMCTestToken(address(this));
        staking = new OMCStaking(address(token), TREASURY, POOL);
        market = new OMCComputeMarket(address(token), address(staking), TREASURY, POOL, SINK);
        reads = IMarketReads(address(market));
        staking.setMarket(address(market));

        token.transfer(PROVIDER, 1_000_000e18);
        token.transfer(REQ, 1_000_000e18);

        vm.prank(PROVIDER);
        token.approve(address(staking), type(uint256).max);
        vm.prank(REQ);
        token.approve(address(market), type(uint256).max);
    }

    function _registerProvider(uint256 stakeAmt) internal {
        vm.prank(PROVIDER);
        staking.stake(stakeAmt, 1);
        vm.prank(PROVIDER);
        staking.registerNode(1, "http://node.local");
    }

    function _openJob(uint256 maxPrice, uint8 tier, bool paidInOMC) internal returns (uint256 jobId) {
        vm.prank(REQ);
        jobId = market.createJob(
            SPEC,
            tier,
            OMCComputeMarket.VerifyPolicy.SPOT_CHECK,
            OMCComputeMarket.Protection.STANDARD,
            maxPrice,
            uint64(block.timestamp + 1 days),
            paidInOMC
        );
    }

    /* -------------------------- escrow conservation ---------------------- */

    /// @dev the market must be a pass-through: whatever it escrowed has to leave
    ///      again on settlement, to the wei. This holds for both fee paths
    ///      (paid in OMC or not).
    function testFuzz_settle_escrowFullyAccountedFor(
        uint96 rawPrice,
        uint96 rawAmount,
        bool paidInOMC
    ) public {
        uint256 maxPrice = bound(uint256(rawPrice), 1e18, 10_000e18);
        uint256 amount = bound(uint256(rawAmount), 1, maxPrice);

        _registerProvider(1_000e18);
        uint256 jobId = _openJob(maxPrice, 1, paidInOMC);

        assertEq(token.balanceOf(address(market)), maxPrice, "escrow not held");
        assertEq(reads.totalEscrowed(), maxPrice, "escrow not accounted for");

        market.assign(jobId, PROVIDER);
        market.confirmDelivery(jobId, RESULT);
        market.settle(jobId, amount);

        assertEq(token.balanceOf(address(market)), 0, "tokens stranded in the market");
        assertEq(reads.totalEscrowed(), 0, "escrow accounting not cleared");
        assertEq(reads.settledJobs(), 1, "settledJobs not incremented");
        assertEq(reads.assignedJobCount(), 0, "assignedJobCount not cleared");

        (, , , , , uint8 state, , uint256 paid, uint256 feePaid, , , , , , ) = reads.job(jobId);
        assertEq(state, ST_SETTLED, "job not settled");
        assertEq(paid, amount, "paid amount");
        assertLt(feePaid, amount, "fee swallowed the whole payment");
    }

    /// @dev the fee is 3%, or 2.7% when paid in OMC — the published discount
    function testFuzz_settle_feeMatchesPublishedRate(uint96 rawAmount, bool paidInOMC) public {
        uint256 amount = bound(uint256(rawAmount), 1e18, 5_000_000e18);

        _registerProvider(1_000e18);
        uint256 jobId = _openJob(amount, 1, paidInOMC);
        market.assign(jobId, PROVIDER);
        market.confirmDelivery(jobId, RESULT);
        market.settle(jobId, amount);

        (, , , , , , , , uint256 feePaid, , , , , , ) = reads.job(jobId);
        uint256 expected = (amount * 300) / 10_000;
        if (paidInOMC) {
            expected -= (expected * 1_000) / 10_000;
        }
        assertEq(feePaid, expected, "fee does not match the published rate");
    }

    /// @dev the requester sets a ceiling and the market can never charge above it
    function testFuzz_settle_rejectsAboveCeiling(uint96 rawPrice, uint96 rawOver) public {
        uint256 maxPrice = bound(uint256(rawPrice), 1e18, 10_000e18);
        uint256 over = bound(uint256(rawOver), 1, 10_000e18);

        _registerProvider(1_000e18);
        uint256 jobId = _openJob(maxPrice, 1, false);
        market.assign(jobId, PROVIDER);
        market.confirmDelivery(jobId, RESULT);

        assertReverts(
            address(market),
            abi.encodeWithSelector(OMCComputeMarket.settle.selector, jobId, maxPrice + over),
            "settled above the requester's ceiling"
        );
    }

    /* --------------------------- failure path ---------------------------- */

    /// @dev the core promise of the design: a failed job pays the requester out
    ///      of the provider's bond, not out of somebody else's escrow
    function testFuzz_fail_fraudPaysRequesterOutOfTheBond(uint96 rawStake, uint96 rawPrice) public {
        uint256 stakeAmt = bound(uint256(rawStake), 20e18, 500_000e18);
        uint256 maxPrice = bound(uint256(rawPrice), 1e18, 10_000e18);

        _registerProvider(stakeAmt);
        uint256 requesterStart = token.balanceOf(REQ);

        uint256 jobId = _openJob(maxPrice, 1, false);
        market.assign(jobId, PROVIDER);
        market.fail(jobId, OMCComputeMarket.FailReason.FRAUD);

        // fraud takes the whole bond: 50% to the requester, 30% treasury, 20% burn
        uint256 expectedComp = stakeAmt / 2;
        assertEq(
            token.balanceOf(REQ),
            requesterStart + expectedComp,
            "requester was not made whole out of the bond"
        );
        assertEq(token.balanceOf(address(market)), 0, "tokens stranded in the market");
        assertEq(reads.totalEscrowed(), 0, "escrow accounting not cleared");

        (, , , , , uint8 state, , , , , , , , , ) = reads.job(jobId);
        assertEq(state, ST_REFUNDED, "job not refunded");

        (, , bool earning, uint256 left, , , , , , , ) = staking.node(PROVIDER);
        assertEq(left, 0, "fraud did not take the whole bond");
        assertFalse(earning, "a slashed provider must stop earning until it heartbeats");
    }

    /// @dev the published penalty table: 2% / 5% / 30% / 100%
    function testFuzz_fail_penaltyMatchesPublishedTable(uint8 rawReason, uint96 rawStake) public {
        uint256 stakeAmt = bound(uint256(rawStake), 20e18, 500_000e18);
        uint256 reason = bound(uint256(rawReason), 0, 3);

        _registerProvider(stakeAmt);
        uint256 jobId = _openJob(1_000e18, 1, false);
        market.assign(jobId, PROVIDER);
        market.fail(jobId, OMCComputeMarket.FailReason(reason));

        uint256[4] memory bps = [uint256(200), 500, 3_000, 10_000];
        uint256 expectedPenalty = (stakeAmt * bps[reason]) / 10_000;

        (, , , uint256 left, , , , , , , ) = staking.node(PROVIDER);
        assertEq(left, stakeAmt - expectedPenalty, "penalty does not match section 7.5");
    }

    /// @dev a provider with no bond behind it can never be assigned a job
    function testFuzz_assign_rejectsUnqualifiedProvider(uint96 rawPrice) public {
        uint256 maxPrice = bound(uint256(rawPrice), 1e18, 10_000e18);
        uint256 jobId = _openJob(maxPrice, 2, false);

        assertReverts(
            address(market),
            abi.encodeWithSelector(OMCComputeMarket.assign.selector, jobId, PROVIDER),
            "unregistered provider was assigned a job"
        );

        // staked for tier 1, but the job needs tier 2
        _registerProvider(100e18);
        assertReverts(
            address(market),
            abi.encodeWithSelector(OMCComputeMarket.assign.selector, jobId, PROVIDER),
            "tier-1 provider was assigned a tier-2 job"
        );

        // top up and retry: the same provider becomes eligible
        vm.prank(PROVIDER);
        staking.stake(1_000e18, 2);
        vm.prank(PROVIDER);
        staking.registerNode(2, "http://node.local");
        assertTrue(market.isEligible(PROVIDER, 2), "topped-up provider still not eligible");
    }

    /// @dev regression test for the self-review finding F-1.
    ///
    ///      OMCStaking.slashFor() applies the whole published 50 / 30 / 20 split and
    ///      forwards only the requester slice to the market. fail() used to pay the
    ///      treasury and burn slices a second time out of its own balance — which is
    ///      just the escrow plus that one slice — so it was short by exactly half of
    ///      every slash and reverted for every non-zero penalty.
    ///
    ///      This asserts the market is a pure pass-through: the treasury and burn
    ///      slices reach their destinations exactly once, and the market's balance
    ///      returns to zero without touching anybody else's escrow.
    function test_fail_doesNotDoubleApplyTheSlashSplit() public {
        uint256 bond = 1_000e18;
        uint256 escrow = 1_000e18;
        uint256 reason = 2; // BAD_OUTPUT: 30%
        uint256 slashed = (bond * 3_000) / 10_000; // 300

        _registerProvider(bond);

        uint256 treasuryBefore = token.balanceOf(TREASURY);
        address dead = staking.BURN_ADDRESS();
        uint256 burnBefore = token.balanceOf(dead);
        uint256 requesterBefore = token.balanceOf(REQ);

        // a second, unrelated job parks escrow in the market: the point of the test
        // is that the failure of the first job can never reach into it
        uint256 otherJob = _openJob(escrow, 1, false);

        uint256 jobId = _openJob(escrow, 1, false);
        market.assign(jobId, PROVIDER);
        market.fail(jobId, OMCComputeMarket.FailReason(reason));

        // the whole slash left the bond, split 50 / 30 / 20 exactly once each
        assertEq(token.balanceOf(TREASURY) - treasuryBefore, (slashed * 3_000) / 10_000, "treasury slice");
        assertEq(
            token.balanceOf(dead) - burnBefore,
            slashed - (slashed * 5_000) / 10_000 - (slashed * 3_000) / 10_000,
            "burn slice"
        );
        assertEq(token.balanceOf(REQ) - requesterBefore, (slashed * 5_000) / 10_000, "requester compensation");

        // and the market paid out exactly one escrow -- its own
        assertEq(token.balanceOf(address(market)), escrow, "market escrow pool raided");
        assertEq(reads.totalEscrowed(), escrow, "escrow accounting drifted");

        vm.prank(REQ);
        market.cancelJob(otherJob);
        assertEq(token.balanceOf(address(market)), 0, "the untouched job could not be refunded");
    }

    /* ---------------------------- lifecycle ------------------------------ */

    /// @dev cancelling an unassigned job returns the escrow exactly
    function testFuzz_cancel_returnsEscrowExactly(uint96 rawPrice) public {
        uint256 maxPrice = bound(uint256(rawPrice), 1e18, 10_000e18);
        uint256 start = token.balanceOf(REQ);
        uint256 jobId = _openJob(maxPrice, 1, false);

        vm.prank(REQ);
        market.cancelJob(jobId);

        assertEq(token.balanceOf(REQ), start, "cancel did not return the escrow in full");
        assertEq(reads.totalEscrowed(), 0, "escrow accounting not cleared");
        (, , , , , uint8 state, , , , , , , , , ) = reads.job(jobId);
        assertEq(state, ST_CANCELLED, "job not cancelled");
    }

    /// @dev the dispute window is exactly 48 hours after delivery
    function testFuzz_disputeWindowIsFortyEightHours(uint32 rawElapsed) public {
        _registerProvider(1_000e18);
        uint256 jobId = _openJob(1_000e18, 1, false);
        market.assign(jobId, PROVIDER);
        market.confirmDelivery(jobId, RESULT);

        uint256 deliveredAt = block.timestamp;
        uint256 elapsed = bound(uint256(rawElapsed), 0, 4 days);

        if (elapsed <= 48 hours) {
            vm.warp(deliveredAt + elapsed);
            vm.prank(REQ);
            market.dispute(jobId);
            (, , , , , uint8 state, , , , , , , , , ) = reads.job(jobId);
            assertEq(state, 5, "job not disputed"); // JobState.DISPUTED
        } else {
            vm.warp(deliveredAt + elapsed);
            assertRevertsAs(
                REQ,
                address(market),
                abi.encodeWithSelector(OMCComputeMarket.dispute.selector, jobId),
                "dispute accepted after the 48 hour window"
            );
        }
    }

    /* --------------------------- access control -------------------------- */

    /// @dev the scheduling verbs are scheduler-only; the requester-side verbs are
    ///      requester-only. Asserted so a refactor cannot widen them silently.
    function test_accessControl_schedulingVerbsAreSchedulerOnly() public {
        _registerProvider(1_000e18);
        uint256 jobId = _openJob(1_000e18, 1, false);

        assertRevertsAs(
            REQ,
            address(market),
            abi.encodeWithSelector(OMCComputeMarket.assign.selector, jobId, PROVIDER),
            "non-scheduler assigned a job"
        );
        assertRevertsAs(
            REQ,
            address(market),
            abi.encodeWithSelector(OMCComputeMarket.settle.selector, jobId, 1e18),
            "non-scheduler settled a job"
        );
        assertRevertsAs(
            REQ,
            address(market),
            abi.encodeWithSelector(
                OMCComputeMarket.fail.selector,
                jobId,
                OMCComputeMarket.FailReason.TIMEOUT
            ),
            "non-scheduler failed a job"
        );
    }

    /// @dev the market reads the ladder back from the staking contract rather
    ///      than keeping a copy, so the two can never drift
    function test_ladderIsSingleSourcedFromStaking() public view {
        for (uint8 t = 0; t <= 6; t++) {
            if (t >= 1 && t <= 5) {
                assertEq(
                    market.minStakeForTier(t),
                    staking.minStakeForTier(t),
                    "market ladder drifted from staking"
                );
            } else {
                // the market's passthrough returns 0 instead of reverting
                assertEq(market.minStakeForTier(t), 0, "invalid tier should read as 0");
            }
        }
    }

    /* ---------------- the penalty burn actually burns (F-12) -------------- */

    /// @dev the node's bond, read out of the public mapping getter
    function _providerBond() internal view returns (uint256 s) {
        (, , , s, , , , , , , ) = staking.node(PROVIDER);
    }

    /// @dev the published penalty table, written out as literals on purpose:
    ///      reading it back from the contract under test would let a build
    ///      change the schedule and still pass.
    function _penaltyBpsLiteral(uint256 reasonId) internal pure returns (uint256) {
        if (reasonId == 0) return 200; // TIMEOUT    2%
        if (reasonId == 1) return 500; // OFFLINE    5%
        if (reasonId == 2) return 3_000; // BAD_OUTPUT 30%
        return 10_000; // FRAUD 100%
    }

    /// @dev F-12. The 20% burn slice of a penalty has to destroy tokens.
    ///
    ///      `token.transfer(0x…dEaD, burned)` empties the sender's balance and
    ///      leaves `totalSupply()` exactly where it was, so the published rule —
    ///      that the slashing burn reduces supply — stops being enforced by the
    ///      code. That is what the shipped revision used to do.
    ///
    ///      This holds the build to the published behaviour, and checks the dead
    ///      address separately, so a build that burns *and* also parks tokens
    ///      there cannot slip through. Run it against the `pre-f5-snapshot`
    ///      build to reproduce the finding.
    function testFuzz_penaltyBurnDestroysTokens(
        uint96 rawStake,
        uint8 rawReason,
        uint96 rawPrice
    ) public {
        uint256 stakeAmt = bound(uint256(rawStake), 20e18, 500_000e18);
        uint8 reasonId = uint8(bound(uint256(rawReason), 0, 3));
        uint256 maxPrice = bound(uint256(rawPrice), 1e18, 10_000e18);

        uint256 deadAtStart = token.balanceOf(SINK);

        _registerProvider(stakeAmt);
        uint256 jobId = _openJob(maxPrice, 1, false);
        market.assign(jobId, PROVIDER);

        uint256 bond = _providerBond();
        uint256 supplyBefore = token.totalSupply();
        uint256 deadBefore = token.balanceOf(SINK);

        market.fail(jobId, OMCComputeMarket.FailReason(reasonId));

        uint256 slashed = (bond * _penaltyBpsLiteral(reasonId)) / 10_000;
        uint256 burned = slashed - (slashed * 5_000) / 10_000 - (slashed * 3_000) / 10_000;

        assertEq(
            supplyBefore - token.totalSupply(),
            burned,
            "totalSupply did not fall by exactly the burn slice"
        );
        assertEq(
            token.balanceOf(SINK),
            deadBefore,
            "the burn slice was moved to the dead address instead of destroyed"
        );
        assertEq(
            token.balanceOf(SINK),
            deadAtStart,
            "the dead address received tokens over the course of the run"
        );
    }

    /// @dev the deterministic counterpart: one concrete penalty, exact numbers,
    ///      so a regression reads as a hard diff rather than a fuzz interval
    function test_badOutputPenalty_burnIsExactlyTwentyPercentOfTheSlash() public {
        _registerProvider(1_000e18);
        uint256 jobId = _openJob(100e18, 1, false);
        market.assign(jobId, PROVIDER);

        uint256 supplyBefore = token.totalSupply();
        assertEq(token.balanceOf(SINK), 0, "dead address should start empty");

        // BAD_OUTPUT = 30% of a 1_000e18 bond = 300e18 slashed
        market.fail(jobId, OMCComputeMarket.FailReason.BAD_OUTPUT);

        // of which 50% -> requester, 30% -> treasury, 20% -> burned
        uint256 expectedBurn = (300e18 * 2_000) / 10_000;

        assertEq(
            supplyBefore - token.totalSupply(),
            expectedBurn,
            "supply did not fall by the 20% burn slice"
        );
        assertEq(token.balanceOf(SINK), 0, "burned tokens were parked at the dead address");
        assertLe(_providerBond(), 700e18, "bond was not reduced by the whole slash");
    }
}
