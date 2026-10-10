// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev minimal ERC-20 surface the market needs for escrow and payout
interface IERC20Like {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @dev The subset of the OMC staking contract the market needs. Read-only for
 *      eligibility (stake + heartbeat standing) and one slashing entry point so
 *      a failed job is paid for out of the provider's bond, not out of escrow
 *      that belongs to somebody else.
 */
interface IStakingLike {
    function minStakeForTier(uint8 tier) external view returns (uint256);

    function nodeSummary(address who)
        external
        view
        returns (
            uint8 tier,
            bool registered,
            bool earning,
            bool overdue,
            uint256 stake,
            uint256 pending,
            uint256 minStake,
            uint256 lastHeartbeat,
            uint256 deadline,
            uint256 missedHeartbeats,
            uint256 slashedTotal,
            uint256 workUnits,
            uint256 registeredAt
        );

    function slashFor(address who, uint8 reason) external returns (uint256 slashed);
}

/**
 * @title  Omniverse Compute (OMC) — Testnet compute market / "AI Compute Station"
 * @notice The requester side of the network. Providers stake and heartbeat on
 *         `OMCStaking` (the /stake page); this contract is where a job is
 *         created, escrowed, assigned, verified and settled (the /compute page).
 *
 * WHY THIS CONTRACT EXISTS
 * ------------------------
 * A staking contract with no demand is a savings account with extra steps. The
 * point of the market is to give staked OMC a job to do:
 *
 *   1. STAKE = RIGHT TO BE ASSIGNED. `assign()` refuses any provider that is not
 *      a registered node in good standing whose stake covers the job's hardware
 *      tier. The ladder itself is never duplicated here — it is read back from
 *      `OMCStaking.minStakeForTier()` so there is exactly one source of truth.
 *   2. STAKE = THE MONEY THAT PAYS FOR A BAD JOB. On failure this contract calls
 *      `slashFor()` and routes 50% of the slashed amount to the requester, so
 *      the refund comes from the provider's bond rather than from another
 *      requester's escrow.
 *   3. OMC = THE PAYMENT TOKEN. Paying in OMC is cheaper, which turns the token
 *      into an input cost for real compute rather than a narrative.
 *
 * PUBLISHED RULES THIS CONTRACT IMPLEMENTS (whitepaper v3.0 section in brackets)
 * -----------------------------------------------------------------------------
 *   - Protocol fee 3%, split 30% buyback-and-burn / 70% reputation reward pool
 *     [7.1]. Hard-coded; the published split is never skimmed.
 *   - Slashing penalties 2% timeout / 5% offline / 30% bad output / 100% fraud
 *     [7.5], and the 50 / 30 / 20 requester-treasury-burn split [7.5].
 *   - Dispute window of 48 hours after delivery [5].
 *   - Scheduling hard filter includes minimum stake [4.3 stage 1].
 *
 * WHAT IS DELIBERATELY NOT ON CHAIN (read this before trusting it)
 * ---------------------------------------------------------------
 *   - The GPU actually runs off chain. This contract is the state machine
 *     around the job (escrow, assignment record, verification verdict,
 *     settlement, penalty), not a compute verifier.
 *   - `scheduler` is a trusted role on testnet, exactly like the `verifier` role
 *     on OMCStaking: an off-chain scheduler picks the node and reports the
 *     verification verdict. This is stated openly on the site, not hidden.
 *   - Prices are set by the requester as a ceiling (`maxPrice`); the amount
 *     actually settled is decided off chain and can never exceed the ceiling.
 *     A public per-hour price list is not encoded in the contract, because the
 *     benchmark is not published yet.
 *   - Not audited. Testnet only. No value is promised or implied.
 */
contract OMCComputeMarket {
    /* ------------------------------ constants --------------------------- */

    uint256 public constant BPS = 10_000;

    /// @dev protocol fee on every settled job, whitepaper 7.1
    uint256 public constant PROTOCOL_FEE_BPS = 300; // 3%

    /// @dev of the fee: 30% buyback-and-burn, 70% reputation reward pool [7.1]
    uint256 public constant FEE_BURN_BPS = 3_000;
    uint256 public constant FEE_REWARD_BPS = 7_000;

    /// @dev of a slashed amount: 50% requester / 30% treasury / 20% burned [7.5]
    uint256 public constant SLASH_REQUESTER_BPS = 5_000;
    uint256 public constant SLASH_TREASURY_BPS = 3_000;
    uint256 public constant SLASH_BURN_BPS = 2_000;

    /// @dev penalty size per failure reason [7.5]
    uint256 public constant PENALTY_TIMEOUT_BPS = 200; // 2%
    uint256 public constant PENALTY_OFFLINE_BPS = 500; // 5%
    uint256 public constant PENALTY_BAD_OUTPUT_BPS = 3_000; // 30%
    uint256 public constant PENALTY_FRAUD_BPS = 10_000; // 100%

    uint256 public constant TIER_COUNT = 5;

    /// @dev dispute window after delivery [5]
    uint256 public constant DISPUTE_WINDOW = 48 hours;

    /// @dev paying in OMC gets a 10% discount on the fee [7.1]
    uint256 public constant OMC_FEE_DISCOUNT_BPS = 1_000; // 10% off the fee

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /* -------------------------------- types ----------------------------- */

    /// @dev failure reasons, mapped 1:1 onto the penalty table in 7.5
    enum FailReason {
        TIMEOUT, // 2%
        OFFLINE, // 5%
        BAD_OUTPUT, // 30%
        FRAUD // 100%
    }

    /// @dev verification policy chosen per job [5]
    enum VerifyPolicy {
        SPOT_CHECK, // base price × (1 + a)
        REDUNDANCY, // 2× to 3×
        TEE // premium
    }

    /// @dev data-protection level chosen per job [6]
    enum Protection {
        STANDARD,
        PROTECTED,
        CONFIDENTIAL
    }

    enum JobState {
        NONE,
        ESCROWED, // funded, waiting for a provider
        ASSIGNED, // provider picked, job running
        DELIVERED, // output returned, inside the dispute window
        SETTLED, // verified and paid
        DISPUTED, // requester contested the output
        REFUNDED, // failed, requester made whole from the bond
        CANCELLED // withdrawn before assignment
    }

    struct Job {
        address requester;
        address provider; // 0 while unassigned
        uint8 hardwareTier; // 1..5, the ladder read from OMCStaking
        VerifyPolicy verifyPolicy;
        Protection protection;
        JobState state;
        uint256 maxPrice; // escrowed ceiling
        uint256 paid; // actual settled amount, <= maxPrice
        uint256 feePaid; // protocol fee taken out of `paid`
        uint64 createdAt;
        uint64 deadline; // delivery deadline for the timeout penalty
        uint64 deliveredAt; // start of the dispute window
        bool paidInOMC; // earns the fee discount
        bytes32 specHash; // container / VRAM / region / driver spec
        bytes32 resultHash; // returned output commitment
    }

    /* -------------------------------- state ----------------------------- */

    address public owner;
    address public scheduler;
    address public treasury;
    address public requesterPool;
    address public feeBurn;
    bool public paused;

    IERC20Like public immutable token;
    IStakingLike public immutable staking;

    uint256 public nextJobId = 1;
    mapping(uint256 => Job) public job;

    uint256 public totalEscrowed;
    uint256 public totalSettledVolume;
    uint256 public totalFees;
    uint256 public totalFeesBurned;
    uint256 public totalFeesToRewards;
    uint256 public totalSlashToRequesters;
    uint256 public totalSlashToTreasury;
    uint256 public totalSlashedFromBonds;
    uint256 public settledJobs;
    uint256 public failedJobs;

    uint256 public assignedJobCount;

    /* -------------------------------- events ---------------------------- */

    event JobCreated(
        uint256 indexed jobId,
        address indexed requester,
        uint8 hardwareTier,
        VerifyPolicy verifyPolicy,
        Protection protection,
        uint256 maxPrice,
        bool paidInOMC,
        bytes32 specHash,
        uint64 deadline
    );
    event JobAssigned(uint256 indexed jobId, address indexed provider, uint256 requiredStake);
    event JobDelivered(uint256 indexed jobId, address indexed provider, bytes32 resultHash);
    event JobDisputed(uint256 indexed jobId, address indexed requester);
    event JobSettled(
        uint256 indexed jobId,
        address indexed provider,
        uint256 paid,
        uint256 fee,
        uint256 toBurn,
        uint256 toRewards
    );
    event JobFailed(
        uint256 indexed jobId,
        address indexed provider,
        FailReason reason,
        uint256 slashed,
        uint256 toRequester,
        uint256 toTreasury,
        uint256 burned
    );
    event JobRefunded(uint256 indexed jobId, address indexed requester, uint256 amount);
    event JobCancelled(uint256 indexed jobId, address indexed requester, uint256 amount);

    event SchedulerChanged(address indexed from, address indexed to);
    event TreasuryChanged(address indexed from, address indexed to);
    event RequesterPoolChanged(address indexed from, address indexed to);
    event FeeBurnChanged(address indexed from, address indexed to);
    event PausedSet(bool paused);
    event OwnershipTransferred(address indexed from, address indexed to);

    /* ------------------------------ modifiers --------------------------- */

    modifier onlyOwner() {
        require(msg.sender == owner, "OMCM: not owner");
        _;
    }

    modifier onlyScheduler() {
        require(msg.sender == scheduler, "OMCM: not scheduler");
        _;
    }

    modifier notPaused() {
        require(!paused, "OMCM: paused");
        _;
    }

    /* ----------------------------- constructor -------------------------- */

    constructor(
        address token_,
        address staking_,
        address treasury_,
        address requesterPool_,
        address feeBurn_
    ) {
        require(token_ != address(0), "OMCM: token");
        require(staking_ != address(0), "OMCM: staking");
        token = IERC20Like(token_);
        staking = IStakingLike(staking_);
        owner = msg.sender;
        scheduler = msg.sender;
        treasury = treasury_ == address(0) ? msg.sender : treasury_;
        requesterPool = requesterPool_ == address(0) ? msg.sender : requesterPool_;
        feeBurn = feeBurn_ == address(0) ? BURN_ADDRESS : feeBurn_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit SchedulerChanged(address(0), scheduler);
        emit TreasuryChanged(address(0), treasury);
        emit RequesterPoolChanged(address(0), requesterPool);
        emit FeeBurnChanged(address(0), feeBurn);
    }

    /* ------------------------------- views ------------------------------ */

    /// @notice the published ladder, read straight from the staking contract so
    ///         the market can never quote a tier minimum the staking contract
    ///         would not enforce
    function minStakeForTier(uint8 tier) public view returns (uint256) {
        if (tier < 1 || tier > TIER_COUNT) return 0;
        return staking.minStakeForTier(tier);
    }

    /// @notice can this provider legally take a job of this tier right now?
    ///         stage-1 hard filter from 4.3: registered, not overdue, stake
    ///         above the tier minimum, and holding the tier asked for
    function isEligible(address provider, uint8 tier) public view returns (bool) {
        (
            uint8 nodeTier,
            bool registered,
            bool earning,
            bool overdue,
            uint256 stake,
            ,
            ,
            ,
            ,
            ,
            ,
            ,

        ) = staking.nodeSummary(provider);
        if (!registered || !earning || overdue) return false;
        if (tier < 1 || tier > TIER_COUNT) return false;
        uint256 need = staking.minStakeForTier(tier);
        return stake >= need && nodeTier >= tier;
    }

    /// @notice how much stake stands behind a provider, and what it would cost
    ///         them to fail this job
    function providerStanding(address provider, uint8 tier, FailReason reason)
        external
        view
        returns (bool eligible, uint256 stake, uint256 requiredStake, uint256 worstCasePenalty)
    {
        uint8 nodeTier;
        bool registered;
        bool earning;
        bool overdue;
        uint256 s;
        (nodeTier, registered, earning, overdue, s, , , , , , , , ) = staking.nodeSummary(provider);
        requiredStake = tier >= 1 && tier <= TIER_COUNT ? staking.minStakeForTier(tier) : 0;
        eligible =
            registered && earning && !overdue && requiredStake > 0 && s >= requiredStake && nodeTier >= tier;
        stake = s;
        worstCasePenalty = (s * _penaltyBps(reason)) / BPS;
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return job[jobId];
    }

    function jobCount() external view returns (uint256) {
        return nextJobId - 1;
    }

    function protocolStats()
        external
        view
        returns (
            uint256 jobsTotal,
            uint256 jobsSettled,
            uint256 jobsFailed,
            uint256 escrowedNow,
            uint256 settledVolume,
            uint256 feesCollected,
            uint256 feesBurned,
            uint256 slashPaidToRequesters,
            uint256 assignedNow
        )
    {
        return (
            nextJobId - 1,
            settledJobs,
            failedJobs,
            totalEscrowed,
            totalSettledVolume,
            totalFees,
            totalFeesBurned,
            totalSlashToRequesters,
            assignedJobCount
        );
    }

    /* ----------------------------- requester ---------------------------- */

    /// @notice create and fund a job. The requester sets the ceiling; the market
    ///         can never charge more than that.
    function createJob(
        bytes32 specHash,
        uint8 hardwareTier,
        VerifyPolicy verifyPolicy,
        Protection protection,
        uint256 maxPrice,
        uint64 deadline,
        bool paidInOMC
    ) external notPaused returns (uint256 jobId) {
        require(hardwareTier >= 1 && hardwareTier <= TIER_COUNT, "OMCM: tier");
        require(maxPrice > 0, "OMCM: price");
        require(deadline > block.timestamp, "OMCM: deadline");

        jobId = nextJobId++;
        Job storage j = job[jobId];
        j.requester = msg.sender;
        j.hardwareTier = hardwareTier;
        j.verifyPolicy = verifyPolicy;
        j.protection = protection;
        j.state = JobState.ESCROWED;
        j.maxPrice = maxPrice;
        j.createdAt = uint64(block.timestamp);
        j.deadline = deadline;
        j.paidInOMC = paidInOMC;
        j.specHash = specHash;

        totalEscrowed += maxPrice;
        require(token.transferFrom(msg.sender, address(this), maxPrice), "OMCM: escrow failed");

        emit JobCreated(
            jobId,
            msg.sender,
            hardwareTier,
            verifyPolicy,
            protection,
            maxPrice,
            paidInOMC,
            specHash,
            deadline
        );
    }

    /// @notice withdraw an unassigned job and get the escrow back
    function cancelJob(uint256 jobId) external notPaused {
        Job storage j = job[jobId];
        require(j.requester == msg.sender, "OMCM: not requester");
        require(j.state == JobState.ESCROWED, "OMCM: not cancellable");
        j.state = JobState.CANCELLED;
        uint256 amount = j.maxPrice;
        totalEscrowed -= amount;
        require(token.transfer(msg.sender, amount), "OMCM: refund failed");
        emit JobCancelled(jobId, msg.sender, amount);
    }

    /// @notice contest the output inside the 48 hour window [5]
    function dispute(uint256 jobId) external notPaused {
        Job storage j = job[jobId];
        require(j.requester == msg.sender, "OMCM: not requester");
        require(j.state == JobState.DELIVERED, "OMCM: not delivered");
        require(block.timestamp <= uint256(j.deliveredAt) + DISPUTE_WINDOW, "OMCM: window closed");
        j.state = JobState.DISPUTED;
        emit JobDisputed(jobId, msg.sender);
    }

    /* ----------------------------- scheduler ---------------------------- */

    /// @notice record which provider took the job. Reverts unless the provider
    ///         passes the stage-1 eligibility filter, which is what makes the
    ///         stake a right to be assigned rather than a decoration.
    function assign(uint256 jobId, address provider) external onlyScheduler notPaused {
        Job storage j = job[jobId];
        require(j.state == JobState.ESCROWED, "OMCM: not open");
        require(provider != address(0), "OMCM: provider");
        require(isEligible(provider, j.hardwareTier), "OMCM: provider not eligible");

        j.provider = provider;
        j.state = JobState.ASSIGNED;
        assignedJobCount += 1;
        emit JobAssigned(jobId, provider, minStakeForTier(j.hardwareTier));
    }

    /// @notice the provider (or its attestation relay) hands back an output hash
    function confirmDelivery(uint256 jobId, bytes32 resultHash)
        external
        onlyScheduler
        notPaused
    {
        Job storage j = job[jobId];
        require(j.state == JobState.ASSIGNED, "OMCM: not assigned");
        j.resultHash = resultHash;
        j.deliveredAt = uint64(block.timestamp);
        j.state = JobState.DELIVERED;
        emit JobDelivered(jobId, j.provider, resultHash);
    }

    /// @notice verification passed: pay the provider out of escrow, take the
    ///         protocol fee and split it 30% burn / 70% rewards [7.1]
    function settle(uint256 jobId, uint256 amount) external onlyScheduler notPaused {
        Job storage j = job[jobId];
        require(
            j.state == JobState.DELIVERED || j.state == JobState.DISPUTED || j.state == JobState.ASSIGNED,
            "OMCM: not settleable"
        );
        require(amount <= j.maxPrice, "OMCM: above ceiling");
        require(amount > 0, "OMCM: amount");

        uint256 fee = (amount * PROTOCOL_FEE_BPS) / BPS;
        if (j.paidInOMC) {
            // 10% off the fee for paying in OMC [7.1]
            fee -= (fee * OMC_FEE_DISCOUNT_BPS) / BPS;
        }
        uint256 toBurn = (fee * FEE_BURN_BPS) / BPS;
        uint256 toRewards = fee - toBurn;
        uint256 toProvider = amount - fee;

        j.state = JobState.SETTLED;
        j.paid = amount;
        j.feePaid = fee;

        uint256 escrow = j.maxPrice;
        totalEscrowed -= escrow;
        totalSettledVolume += amount;
        totalFees += fee;
        totalFeesBurned += toBurn;
        totalFeesToRewards += toRewards;
        settledJobs += 1;
        if (assignedJobCount > 0) assignedJobCount -= 1;

        // burn (or send to the configured burn sink)
        if (toBurn > 0) require(token.transfer(feeBurn, toBurn), "OMCM: burn failed");
        // reputation reward pool, held by the treasury-side pool address
        if (toRewards > 0) require(token.transfer(requesterPool, toRewards), "OMCM: pool failed");
        // provider
        if (toProvider > 0) require(token.transfer(j.provider, toProvider), "OMCM: payout failed");
        // refund the unused part of the ceiling, if any
        uint256 leftover = escrow - amount;
        if (leftover > 0) require(token.transfer(j.requester, leftover), "OMCM: leftover failed");

        emit JobSettled(jobId, j.provider, amount, fee, toBurn, toRewards);
    }

    /// @notice verification failed: slash the provider's bond and make the
    ///         requester whole out of it, then refund anything left of escrow.
    ///         The refund therefore comes from the bond, not from other people's
    ///         escrow — which is the whole point of requiring a stake.
    function fail(uint256 jobId, FailReason reason) external onlyScheduler notPaused {
        Job storage j = job[jobId];
        require(
            j.state == JobState.ASSIGNED ||
                j.state == JobState.DELIVERED ||
                j.state == JobState.DISPUTED,
            "OMCM: not fail-able"
        );

        address provider = j.provider;
        uint256 escrow = j.maxPrice;
        totalEscrowed -= escrow;
        failedJobs += 1;
        if (assignedJobCount > 0) assignedJobCount -= 1;

        uint256 slashed = 0;
        uint256 toRequester = 0;
        uint256 toTreasury = 0;
        uint256 burned = 0;

        if (provider != address(0)) {
            slashed = staking.slashFor(provider, uint8(reason));
            if (slashed > 0) {
                toRequester = (slashed * SLASH_REQUESTER_BPS) / BPS;
                toTreasury = (slashed * SLASH_TREASURY_BPS) / BPS;
                burned = slashed - toRequester - toTreasury;
                totalSlashedFromBonds += slashed;
                totalSlashToRequesters += toRequester;
                totalSlashToTreasury += toTreasury;
                if (toRequester > 0)
                    require(token.transfer(j.requester, toRequester), "OMCM: comp failed");
                if (toTreasury > 0) require(token.transfer(treasury, toTreasury), "OMCM: treas failed");
                if (burned > 0) require(token.transfer(feeBurn, burned), "OMCM: burn failed");
            }
        }

        j.state = JobState.REFUNDED;
        require(token.transfer(j.requester, escrow), "OMCM: refund failed");

        emit JobFailed(jobId, provider, reason, slashed, toRequester, toTreasury, burned);
        emit JobRefunded(jobId, j.requester, escrow + toRequester);
    }

    /// @notice resolve a dispute. If the re-execution reproduced the output the
    ///         provider is cleared and the job re-enters the normal settle path;
    ///         otherwise it re-enters the fail path and the bond is charged.
    function resolveDispute(uint256 jobId, bool inFavourOfProvider)
        external
        onlyScheduler
        notPaused
    {
        Job storage j = job[jobId];
        require(j.state == JobState.DISPUTED, "OMCM: not disputed");

        if (inFavourOfProvider) {
            j.state = JobState.DELIVERED; // re-enter the normal settle path
            emit JobDelivered(jobId, j.provider, j.resultHash);
        } else {
            j.state = JobState.ASSIGNED; // re-enter the normal fail path
            emit JobAssigned(jobId, j.provider, minStakeForTier(j.hardwareTier));
        }
    }

    /* ------------------------------- admin ------------------------------ */

    function setScheduler(address v) external onlyOwner {
        require(v != address(0), "OMCM: scheduler");
        emit SchedulerChanged(scheduler, v);
        scheduler = v;
    }

    function setTreasury(address v) external onlyOwner {
        require(v != address(0), "OMCM: treasury");
        emit TreasuryChanged(treasury, v);
        treasury = v;
    }

    function setRequesterPool(address v) external onlyOwner {
        require(v != address(0), "OMCM: pool");
        emit RequesterPoolChanged(requesterPool, v);
        requesterPool = v;
    }

    function setFeeBurn(address v) external onlyOwner {
        require(v != address(0), "OMCM: burn");
        emit FeeBurnChanged(feeBurn, v);
        feeBurn = v;
    }

    function setPaused(bool v) external onlyOwner {
        paused = v;
        emit PausedSet(v);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "OMCM: owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /* ------------------------------ internals --------------------------- */

    function _penaltyBps(FailReason reason) internal pure returns (uint256) {
        if (reason == FailReason.TIMEOUT) return PENALTY_TIMEOUT_BPS;
        if (reason == FailReason.OFFLINE) return PENALTY_OFFLINE_BPS;
        if (reason == FailReason.BAD_OUTPUT) return PENALTY_BAD_OUTPUT_BPS;
        return PENALTY_FRAUD_BPS;
    }
}
