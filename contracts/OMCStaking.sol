// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev minimal ERC-20 surface the staking contract needs
interface IERC20Like {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @title  Omniverse Compute (OMC) — Testnet staking & compute-mining contract
 * @notice Implements, on chain, the exact rules the OMC testnet documentation
 *         already publishes: stake by hardware tier, register a node heartbeat,
 *         get slashed for going dark or for fraudulent work, and collect
 *         rewards for verified jobs.
 *
 * PUBLISHED RULES THIS CONTRACT IMPLEMENTS
 * ----------------------------------------
 *   1. Staking minimums are a published ladder, not a formula:
 *      `minStakeForTier(tier)` -> 20 / 100 / 500 / 1000 / 5000 OMC for tiers 1..5.
 *      Tier 1 is priced at one airdrop entry (20 OMC) and tier 2 at one full
 *      airdrop (5 × 20 = 100 OMC), so a wallet that maxes out the airdrop can
 *      reach tier 2 without buying anything. Tiers 3..5 require OMC from the
 *      compute-mining pool or the open market, which is what gives the ladder
 *      its meaning.
 *   2. Node registration + heartbeat; missed heartbeats are one of the slashing
 *      triggers.
 *   3. Slashing split: 50% to the requesters who were harmed, 30% to the DAO
 *      treasury, 20% permanently burned. Hard-coded, no bounty is skimmed, so
 *      the published split stays exact.
 *   4. Rewards are only paid for verified work; a node in bad standing earns
 *      nothing until it heartbeats again.
 *   5. The annualised staking reward has a published ceiling (`maxAprBps`,
 *      default 20%). Emission is a rate per second, so a fixed schedule pays
 *      the same absolute amount however little is staked — a near-empty pool
 *      therefore implies a meaningless APR (864 tOMC/day against 362 tOMC
 *      staked is ~87,000%/year). The rate actually used is
 *      `min(emissionPerSecond, totalStake * maxAprBps / BPS / SECONDS_PER_YEAR)`,
 *      so the ceiling always binds while stake is small and the 10-year
 *      schedule takes over on its own once enough stake exists.
 *
 * DESIGN NOTES (read before trusting this in production)
 * ------------------------------------------------------
 *   - Solvency: `rewardLiquidity` is the only money that pays rewards, and it is
 *     topped up with `fundRewards()`. Staked principal is never used to pay
 *     rewards, so the contract can always refund every unstake.
 *   - Emission accrues lazily on interaction with an O(1) accumulator
 *     (`accRewardPerShare`), with `accruedNotPaid` bounding accrual so the
 *     contract can never owe more than its reward pool holds.
 *   - Overdue detection is not a cron job: a node is flagged when it next
 *     interacts (`heartbeat`, `claim`, `unstake`, `reportWork`) or when anyone
 *     calls `slashOverdue()`. A node therefore cannot escape its slashing debt —
 *     it settles before it is allowed to move stake or withdraw rewards.
 *   - Task rewards are attested by a `verifier` address. On a testnet that is a
 *     trusted role acting on off-chain verification results; that is stated
 *     openly on the site rather than hidden.
 *   - The APR ceiling needs no oracle: rewards and stake are denominated in the
 *     same token, so the cap is arithmetic rather than a price feed. It also
 *     means the ceiling can never be dodged by moving the price.
 *   - Not audited. Testnet only. No value is promised or implied.
 */
contract OMCStaking {
    /* ------------------------------ constants --------------------------- */

    uint256 public constant BPS = 10_000;

    /// @dev hardware tiers 1..TIER_COUNT
    uint256 public constant TIER_COUNT = 5;

    /// @dev a node that stops heart-beating is overdue after
    ///      heartbeatInterval + heartbeatGrace (owner-tunable, so the slashing
    ///      path can be exercised end to end on the testnet)
    uint256 public heartbeatInterval = 30 minutes;
    uint256 public heartbeatGrace = 10 minutes;

    /// @dev share of the node's stake burned into a slash, per overdue interval
    uint256 public constant SLASH_BPS_PER_INTERVAL = 500; // 5%

    /// @dev published slash split: 50 / 30 / 20
    uint256 public constant SLASH_REQUESTERS_BPS = 5_000;
    uint256 public constant SLASH_TREASURY_BPS = 3_000;
    uint256 public constant SLASH_BURN_BPS = 2_000;

    /// @dev job-failure penalties charged by the compute market, whitepaper 7.5:
    ///      timeout 2% / offline 5% / bad output 30% / fraud 100%. Same split
    ///      above applies, so a failed job compensates its requester out of the
    ///      provider's bond instead of out of somebody else's escrow.
    uint256 public constant SLASH_JOB_TIMEOUT_BPS = 200; // 2%
    uint256 public constant SLASH_JOB_OFFLINE_BPS = 500; // 5%
    uint256 public constant SLASH_JOB_BAD_OUTPUT_BPS = 3_000; // 30%
    uint256 public constant SLASH_JOB_FRAUD_BPS = 10_000; // 100%

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /* -------------------------------- state ----------------------------- */

    IERC20Like public immutable token;

    address public owner;
    address public verifier;
    address public treasury;
    address public requesterPool;

    /// @dev the compute market contract; the only address allowed to charge a
    ///      job-failure penalty (see `slashFor`). Zero until one is registered.
    address public market;

    bool public paused;

    /// @dev published staking ladder, one entry per tier (tier 1 .. tier 5).
    ///      20 / 100 / 500 / 1000 / 5000 OMC. The steps are deliberately
    ///      non-linear: tier 1 = one airdrop entry, tier 2 = one full airdrop,
    ///      tiers 3..5 escalate hard so a higher tier really means a bigger
    ///      machine rather than just more free tokens.
    uint256[TIER_COUNT] public tierMinStake = [
        20e18,
        100e18,
        500e18,
        1000e18,
        5000e18
    ];

    /// @dev kept for backward-compatible reads; equals tierMinStake[1] (tier 2).
    ///      Deprecated — use `tierMinStake(tier)` / `minStakeForTier(tier)`.
    uint256 public tierBaseDeposit = 100e18;

    /// @dev reward emission, in tOMC wei per second, shared by earning nodes
    uint256 public emissionPerSecond = 1e16; // 0.01 tOMC/s ≈ 864 tOMC / day

    /// @dev ceiling on the annualised staking reward, in bps (2000 = 20%/year).
    ///      See published rule 5. Emission is a per-second rate, so it must be
    ///      clamped by how much is actually staked or a small pool pays an
    ///      absurd rate. Read `effectiveEmissionPerSecond()` for the live value.
    uint256 public maxAprBps = 2_000; // 20% / year

    /// @dev the year the ceiling is quoted over (365 days, not 365.25)
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    /// @dev reward paid per verified work unit
    uint256 public workUnitReward = 1e18;

    uint256 public accRewardPerShare; // 1e18-scaled accumulator
    uint256 public lastAccrual;
    uint256 public totalStake;        // sum of stake of nodes in good standing
    uint256 public rewardLiquidity;   // tokens set aside to pay rewards
    uint256 public accruedNotPaid;    // accrued emission + reported work, unpaid
    uint256 public totalSlashed;
    uint256 public totalWorkUnits;

    struct Node {
        uint8 tier;
        bool registered;
        bool earning;          // true = counted in totalStake, accruing emission
        uint256 stake;         // principal locked for this node
        uint256 rewardDebt;    // accounting cursor for the accumulator
        uint256 pending;       // accrued rewards not yet claimed
        uint256 registeredAt;
        uint256 lastHeartbeat;
        uint256 missedHeartbeats;
        uint256 slashedTotal;
        uint256 workUnits;
    }

    mapping(address => Node) public node;
    mapping(address => string) public endpoint;
    address[] public nodeAddresses;

    /* -------------------------------- events ---------------------------- */

    event Staked(address indexed who, uint256 amount, uint8 tier, uint256 totalStakeOfNode);
    event Unstaked(address indexed who, uint256 amount, uint256 totalStakeOfNode);
    event NodeRegistered(address indexed who, uint8 tier, uint256 minStake, string endpoint);
    event NodeDeregistered(address indexed who);
    event Heartbeat(address indexed who, uint256 missedIntervals);
    event Slashed(
        address indexed who,
        uint256 amount,
        uint256 toRequesters,
        uint256 toTreasury,
        uint256 burned,
        uint256 missedIntervals,
        address indexed triggeredBy
    );
    event RewardsClaimed(address indexed who, uint256 amount, uint256 remainingPending);
    event WorkReported(address indexed who, uint256 units, uint256 reward, address indexed verifier);
    event RewardsFunded(address indexed from, uint256 amount, uint256 liquidity);
    event VerifierChanged(address indexed from, address indexed to);
    event TreasuryChanged(address indexed from, address indexed to);
    event RequesterPoolChanged(address indexed from, address indexed to);
    event MarketChanged(address indexed from, address indexed to);
    event JobSlashed(address indexed who, uint256 amount, uint8 reason);
    event EmissionChanged(uint256 from, uint256 to);
    event MaxAprChanged(uint256 from, uint256 to);
    event HeartbeatParamsChanged(uint256 interval, uint256 grace);
    event WorkUnitRewardChanged(uint256 from, uint256 to);
    event TierBaseDepositChanged(uint256 from, uint256 to);
    event TierMinStakeChanged(uint256 indexed tier, uint256 from, uint256 to);
    event PausedSet(bool paused);
    event OwnershipTransferred(address indexed from, address indexed to);

    /* ------------------------------ modifiers --------------------------- */

    modifier onlyOwner() {
        require(msg.sender == owner, "OMCS: not owner");
        _;
    }

    modifier onlyVerifier() {
        require(msg.sender == verifier, "OMCS: not verifier");
        _;
    }

    modifier onlyMarket() {
        require(msg.sender == market && market != address(0), "OMCS: not market");
        _;
    }

    modifier notPaused() {
        require(!paused, "OMCS: paused");
        _;
    }

    /* ----------------------------- constructor -------------------------- */

    constructor(address token_, address treasury_, address requesterPool_) {
        require(token_ != address(0), "OMCS: token");
        token = IERC20Like(token_);
        owner = msg.sender;
        verifier = msg.sender;
        treasury = treasury_ == address(0) ? msg.sender : treasury_;
        requesterPool = requesterPool_ == address(0) ? msg.sender : requesterPool_;
        lastAccrual = block.timestamp;
        emit OwnershipTransferred(address(0), msg.sender);
        emit VerifierChanged(address(0), verifier);
        emit TreasuryChanged(address(0), treasury);
        emit RequesterPoolChanged(address(0), requesterPool);
        emit MarketChanged(address(0), address(0));
    }

    /* ------------------------------- views ------------------------------ */

    /// @notice published rule: 20 / 100 / 500 / 1000 / 5000 OMC for tiers 1..5
    function minStakeForTier(uint8 tier) public view returns (uint256) {
        require(tier >= 1 && tier <= TIER_COUNT, "OMCS: tier");
        return tierMinStake[tier - 1];
    }

    function nodeCount() external view returns (uint256) {
        return nodeAddresses.length;
    }

    /// @notice timestamp after which the node counts as overdue (0 = never heartbeated)
    function heartbeatDeadline(address who) public view returns (uint256) {
        uint256 hb = node[who].lastHeartbeat;
        if (hb == 0) return 0;
        return hb + heartbeatInterval + heartbeatGrace;
    }

    function isOverdue(address who) public view returns (bool) {
        return _overdueIntervals(who) > 0;
    }

    /// @notice the emission rate actually in force, after the APR ceiling.
    ///         Zero when nothing is staked: the ceiling is quoted per unit of
    ///         stake, so with no stake there is no rate to quote.
    function effectiveEmissionPerSecond() public view returns (uint256) {
        if (totalStake == 0 || maxAprBps == 0) return 0;
        uint256 cap = (totalStake * maxAprBps) / BPS / SECONDS_PER_YEAR;
        return cap < emissionPerSecond ? cap : emissionPerSecond;
    }

    /// @notice which of the two constraints is binding right now, for the UI
    ///         and for anyone auditing the published ceiling
    /// @return rate      same value as effectiveEmissionPerSecond()
    /// @return cappedBy  "apr" | "schedule" | "none"
    function emissionConstraint() external view returns (uint256 rate, string memory cappedBy) {
        rate = effectiveEmissionPerSecond();
        if (totalStake == 0) return (rate, "none");
        uint256 cap = (totalStake * maxAprBps) / BPS / SECONDS_PER_YEAR;
        return (rate, cap < emissionPerSecond ? "apr" : "schedule");
    }

    /// @notice emission that has accrued but is not covered by the reward pool
    ///         yet — capped by the APR ceiling, and capped so the contract never
    ///         owes more than it holds
    function _accruableNow() internal view returns (uint256) {
        if (totalStake == 0 || lastAccrual == 0) return 0;
        uint256 dt = block.timestamp - lastAccrual;
        if (dt == 0) return 0;
        uint256 rate = effectiveEmissionPerSecond();
        if (rate == 0) return 0;
        uint256 want = dt * rate;
        uint256 free = rewardLiquidity > accruedNotPaid ? rewardLiquidity - accruedNotPaid : 0;
        return want > free ? free : want;
    }

    /// @notice live pending rewards, including emission accrued since the last
    ///         interaction (the UI can call this instead of doing its own math)
    function pendingOf(address who) public view returns (uint256 pending, uint256 accruing) {
        Node memory n = node[who];
        if (n.stake == 0 || totalStake == 0) return (n.pending, 0);
        uint256 acc = (accRewardPerShare + (_accruableNow() * 1e18) / totalStake) * n.stake / 1e18;
        if (acc <= n.rewardDebt) return (n.pending, 0);
        accruing = acc - n.rewardDebt;
        pending = n.pending + accruing;
    }

    /// @notice one flat struct-free summary for the front end
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
        )
    {
        Node memory n = node[who];
        (uint256 p, ) = pendingOf(who);
        uint256 minS = n.tier >= 1 && n.tier <= TIER_COUNT ? minStakeForTier(n.tier) : 0;
        return (
            n.tier,
            n.registered,
            n.earning,
            _overdueIntervals(who) > 0,
            n.stake,
            p,
            minS,
            n.lastHeartbeat,
            heartbeatDeadline(who),
            n.missedHeartbeats,
            n.slashedTotal,
            n.workUnits,
            n.registeredAt
        );
    }

    function protocolStats()
        external
        view
        returns (
            uint256 totalStake_,
            uint256 emissionPerSecond_,
            uint256 rewardLiquidity_,
            uint256 accruedNotPaid_,
            uint256 nodes_,
            uint256 totalSlashed_,
            uint256 totalWorkUnits_,
            uint256 tierBaseDeposit_
        )
    {
        return (
            totalStake,
            emissionPerSecond,
            rewardLiquidity,
            accruedNotPaid,
            nodeAddresses.length,
            totalSlashed,
            totalWorkUnits,
            tierBaseDeposit
        );
    }

    function getNodeAddresses(uint256 offset, uint256 limit) external view returns (address[] memory out) {
        uint256 n = nodeAddresses.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        out = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            out[i - offset] = nodeAddresses[i];
        }
    }

    /* ----------------------------- user flows --------------------------- */

    /// @notice stake tOMC and declare the hardware tier you are staking for
    /// @dev    first stake must already satisfy minStakeForTier(tier)
    function stake(uint256 amount, uint8 tier) external notPaused {
        require(amount > 0, "OMCS: amount");
        require(tier >= 1 && tier <= TIER_COUNT, "OMCS: tier");
        Node storage n = node[msg.sender];
        _settle(msg.sender);

        uint256 newStake = n.stake + amount;
        require(newStake >= minStakeForTier(tier), "OMCS: below tier minimum");
        if (n.registered) require(n.lastHeartbeat > 0, "OMCS: register issue");

        n.stake = newStake;
        n.tier = tier;
        if (n.earning) totalStake += amount;
        n.rewardDebt = (n.stake * accRewardPerShare) / 1e18;

        require(token.transferFrom(msg.sender, address(this), amount), "OMCS: transferFrom");
        emit Staked(msg.sender, amount, tier, newStake);
    }

    /// @notice withdraw stake; a registered node must stay above its tier minimum
    function unstake(uint256 amount) external {
        require(amount > 0, "OMCS: amount");
        Node storage n = node[msg.sender];
        require(n.stake >= amount, "OMCS: stake");
        require(_overdueIntervals(msg.sender) == 0, "OMCS: heartbeat first");
        _settle(msg.sender);

        uint256 remaining = n.stake - amount;
        if (n.registered) {
            require(remaining >= minStakeForTier(n.tier), "OMCS: below tier minimum");
        } else {
            require(remaining == 0 || remaining > 0, "OMCS: amount");
        }
        if (n.earning) totalStake -= amount;
        n.stake = remaining;
        if (remaining == 0) {
            n.tier = 0;
            n.registered = false;
            n.earning = false;
        }
        n.rewardDebt = (n.stake * accRewardPerShare) / 1e18;

        require(token.transfer(msg.sender, amount), "OMCS: transfer");
        emit Unstaked(msg.sender, amount, remaining);
    }

    /// @notice register (or re-tier) a node; also serves as the first heartbeat
    function registerNode(uint8 tier, string calldata ep) external notPaused {
        require(tier >= 1 && tier <= TIER_COUNT, "OMCS: tier");
        Node storage n = node[msg.sender];
        _settle(msg.sender);
        uint256 minS = minStakeForTier(tier);
        require(n.stake >= minS, "OMCS: below tier minimum");

        if (!n.registered) {
            n.registered = true;
            n.registeredAt = block.timestamp;
            nodeAddresses.push(msg.sender);
        }
        n.tier = tier;
        n.lastHeartbeat = block.timestamp;
        endpoint[msg.sender] = ep;
        if (!n.earning && n.stake > 0) {
            n.earning = true;
            totalStake += n.stake;
        }
        n.rewardDebt = (n.stake * accRewardPerShare) / 1e18;
        emit NodeRegistered(msg.sender, tier, minS, ep);
    }

    /// @notice prove the node is alive; pays any slashing debt first, then resumes
    function heartbeat() external notPaused {
        Node storage n = node[msg.sender];
        require(n.registered, "OMCS: not registered");
        _settle(msg.sender);

        uint256 missed = _overdueIntervals(msg.sender);
        if (missed > 0) {
            _applySlash(msg.sender, missed);
        }

        n.lastHeartbeat = block.timestamp;
        n.missedHeartbeats += missed;
        if (!n.earning && n.stake > 0) {
            n.earning = true;
            totalStake += n.stake;
        }
        n.rewardDebt = (n.stake * accRewardPerShare) / 1e18;
        emit Heartbeat(msg.sender, missed);
    }

    /// @notice anyone may settle an overdue node's slashing debt
    function slashOverdue(address who) external notPaused returns (uint256 slashed) {
        Node storage n = node[who];
        require(n.registered, "OMCS: not registered");
        _settle(who);
        uint256 missed = _overdueIntervals(who);
        require(missed > 0, "OMCS: not overdue");
        slashed = _applySlash(who, missed);
        n.lastHeartbeat = block.timestamp; // must heartbeat again to resume earning
    }

    /// @notice a completed job failed verification; charge the provider's bond.
    ///         Only the market contract calls this, and the reason index maps
    ///         1:1 onto the penalty table the whitepaper publishes in 7.5:
    ///           0 = timeout      2%
    ///           1 = offline      5%
    ///           2 = bad output   30%
    ///           3 = fraud        100%
    /// @return slashed the amount taken off the bond
    function slashFor(address who, uint8 reason) external onlyMarket notPaused returns (uint256 slashed) {
        Node storage n = node[who];
        require(n.registered, "OMCS: not registered");
        require(n.stake > 0, "OMCS: nothing staked");

        uint256 bps;
        if (reason == 0) bps = SLASH_JOB_TIMEOUT_BPS;
        else if (reason == 1) bps = SLASH_JOB_OFFLINE_BPS;
        else if (reason == 2) bps = SLASH_JOB_BAD_OUTPUT_BPS;
        else if (reason == 3) bps = SLASH_JOB_FRAUD_BPS;
        else revert("OMCS: reason");

        _settle(who);
        // a node that just failed a job is no longer earning until it heartbeats
        if (n.earning) {
            totalStake -= n.stake;
            n.earning = false;
        }

        slashed = (n.stake * bps) / BPS;
        if (slashed > n.stake) slashed = n.stake;
        if (slashed == 0) return 0;

        n.stake -= slashed;
        n.slashedTotal += slashed;
        totalSlashed += slashed;

        uint256 toRequesters = (slashed * SLASH_REQUESTERS_BPS) / BPS;
        uint256 toTreasury = (slashed * SLASH_TREASURY_BPS) / BPS;
        uint256 burned = slashed - toRequesters - toTreasury;

        // the requester-compensation slice is paid to the market contract, which
        // forwards it to the requester whose job failed
        if (toRequesters > 0) require(token.transfer(market, toRequesters), "OMCS: transfer");
        if (toTreasury > 0) require(token.transfer(treasury, toTreasury), "OMCS: transfer");
        if (burned > 0) require(token.transfer(BURN_ADDRESS, burned), "OMCS: transfer");

        emit Slashed(who, slashed, toRequesters, toTreasury, burned, 0, msg.sender);
        emit JobSlashed(who, slashed, reason);
    }

    /// @notice leave the node registry so the full stake can be withdrawn
    function deregister() external {
        Node storage n = node[msg.sender];
        require(n.registered, "OMCS: not registered");
        require(_overdueIntervals(msg.sender) == 0, "OMCS: heartbeat first");
        _settle(msg.sender);
        if (n.earning) {
            totalStake -= n.stake;
            n.earning = false;
        }
        n.registered = false;
        n.tier = 0;
        emit NodeDeregistered(msg.sender);
    }

    /// @notice claim accrued rewards; always callable, even while paused
    function claim() external returns (uint256 paid) {
        _settle(msg.sender);
        Node storage n = node[msg.sender];
        uint256 p = n.pending;
        require(p > 0, "OMCS: nothing to claim");

        uint256 free = rewardLiquidity;
        paid = p > free ? free : p;
        require(paid > 0, "OMCS: reward pool empty");
        n.pending = p - paid;
        rewardLiquidity -= paid;
        accruedNotPaid = accruedNotPaid > paid ? accruedNotPaid - paid : 0;

        require(token.transfer(msg.sender, paid), "OMCS: transfer");
        emit RewardsClaimed(msg.sender, paid, n.pending);
    }

    /* ------------------------------- verifier --------------------------- */

    /// @notice attest verified work; the reward is drawn from the reward pool
    function reportWork(address who, uint256 units) external onlyVerifier notPaused {
        require(units > 0, "OMCS: units");
        Node storage n = node[who];
        require(n.registered, "OMCS: not registered");
        require(n.earning || _overdueIntervals(who) == 0, "OMCS: node in bad standing");
        _settle(who);

        uint256 reward = units * workUnitReward;
        require(accruedNotPaid + reward <= rewardLiquidity, "OMCS: reward pool empty");

        n.workUnits += units;
        n.pending += reward;
        accruedNotPaid += reward;
        totalWorkUnits += units;
        emit WorkReported(who, units, reward, msg.sender);
    }

    /// @notice top up the reward pool; this money can only ever pay rewards
    function fundRewards(uint256 amount) external {
        require(amount > 0, "OMCS: amount");
        require(token.transferFrom(msg.sender, address(this), amount), "OMCS: transferFrom");
        rewardLiquidity += amount;
        emit RewardsFunded(msg.sender, amount, rewardLiquidity);
    }

    /* -------------------------------- admin ----------------------------- */

    function setVerifier(address v) external onlyOwner {
        require(v != address(0), "OMCS: zero");
        emit VerifierChanged(verifier, v);
        verifier = v;
    }

    function setTreasury(address t) external onlyOwner {
        require(t != address(0), "OMCS: zero");
        emit TreasuryChanged(treasury, t);
        treasury = t;
    }

    function setRequesterPool(address r) external onlyOwner {
        require(r != address(0), "OMCS: zero");
        emit RequesterPoolChanged(requesterPool, r);
        requesterPool = r;
    }

    /// @notice register the compute market that may charge job-failure penalties
    function setMarket(address m) external onlyOwner {
        emit MarketChanged(market, m);
        market = m;
    }

    function setEmissionPerSecond(uint256 v) external onlyOwner {
        _accrue();
        emit EmissionChanged(emissionPerSecond, v);
        emissionPerSecond = v;
    }

    /// @notice set the ceiling on the annualised staking reward, in bps.
    ///         Bounded to (0, BPS] so it cannot be switched off by accident —
    ///         it is a published consumer-protection promise, not a dial.
    function setMaxAprBps(uint256 v) external onlyOwner {
        require(v > 0 && v <= BPS, "OMCS: apr");
        _accrue();                 // settle everything owed at the OLD ceiling first
        emit MaxAprChanged(maxAprBps, v);
        maxAprBps = v;
    }

    /// @notice tune the liveness window; interval must stay >= 1 minute
    function setHeartbeatParams(uint256 interval, uint256 grace) external onlyOwner {
        require(interval >= 1 minutes, "OMCS: interval");
        require(grace <= interval, "OMCS: grace");
        heartbeatInterval = interval;
        heartbeatGrace = grace;
        emit HeartbeatParamsChanged(interval, grace);
    }

    function setWorkUnitReward(uint256 v) external onlyOwner {
        emit WorkUnitRewardChanged(workUnitReward, v);
        workUnitReward = v;
    }

    function setTierBaseDeposit(uint256 v) external onlyOwner {
        require(v > 0, "OMCS: zero");
        emit TierBaseDepositChanged(tierBaseDeposit, v);
        tierBaseDeposit = v;
    }

    /// @notice update one rung of the staking ladder (tier 1..TIER_COUNT)
    function setTierMinStake(uint8 tier, uint256 v) external onlyOwner {
        require(tier >= 1 && tier <= TIER_COUNT, "OMCS: tier");
        require(v > 0, "OMCS: zero");
        emit TierMinStakeChanged(tier, tierMinStake[tier - 1], v);
        tierMinStake[tier - 1] = v;
    }

    function setPaused(bool v) external onlyOwner {
        paused = v;
        emit PausedSet(v);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "OMCS: zero");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /* ------------------------------ internals --------------------------- */

    /// @dev how many heartbeat intervals the node has missed right now
    function _overdueIntervals(address who) internal view returns (uint256) {
        Node memory n = node[who];
        if (!n.earning || n.lastHeartbeat == 0) return 0;
        uint256 deadline = n.lastHeartbeat + heartbeatInterval + heartbeatGrace;
        if (block.timestamp <= deadline) return 0;
        return ((block.timestamp - deadline) / heartbeatInterval) + 1;
    }

    /// @dev move the accumulator forward, never accruing more than the pool holds
    function _accrue() internal {
        uint256 reward = _accruableNow();
        lastAccrual = block.timestamp;
        if (reward == 0 || totalStake == 0) return;
        accRewardPerShare += (reward * 1e18) / totalStake;
        accruedNotPaid += reward;
    }

    /// @dev bring `who`'s accounting up to date
    function _settle(address who) internal {
        _accrue();
        Node storage n = node[who];
        if (n.stake > 0) {
            uint256 acc = (n.stake * accRewardPerShare) / 1e18;
            if (acc > n.rewardDebt) n.pending += acc - n.rewardDebt;
            n.rewardDebt = acc;
        } else {
            n.rewardDebt = 0;
        }
    }

    /// @dev take the node out of the earning set, then apply the published split
    function _applySlash(address who, uint256 intervals) internal returns (uint256 amount) {
        Node storage n = node[who];
        if (n.earning) {
            totalStake -= n.stake;
            n.earning = false;
        }
        if (n.stake == 0) return 0;

        amount = (n.stake * SLASH_BPS_PER_INTERVAL * intervals) / BPS;
        if (amount > n.stake) amount = n.stake;
        if (amount == 0) return 0;

        n.stake -= amount;
        n.slashedTotal += amount;
        totalSlashed += amount;

        uint256 toRequesters = (amount * SLASH_REQUESTERS_BPS) / BPS;
        uint256 toTreasury = (amount * SLASH_TREASURY_BPS) / BPS;
        uint256 burned = amount - toRequesters - toTreasury;

        if (toRequesters > 0) require(token.transfer(requesterPool, toRequesters), "OMCS: transfer");
        if (toTreasury > 0) require(token.transfer(treasury, toTreasury), "OMCS: transfer");
        if (burned > 0) require(token.transfer(BURN_ADDRESS, burned), "OMCS: transfer");

        emit Slashed(who, amount, toRequesters, toTreasury, burned, intervals, msg.sender);
    }
}
