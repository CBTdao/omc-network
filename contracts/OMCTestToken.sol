// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  Omniverse Compute (OMC) — BNB Chain Testnet utility token "tOMC"
 * @notice A transferable test token with a public faucet. It exists so that the
 *         testnet staking and compute-mining flow can be exercised end to end.
 *
 * WHAT THIS IS
 * ------------
 *   - A plain, self-contained ERC-20 (no external imports) so it can be compiled
 *     and verified from a single file.
 *   - `claimFaucet()` hands out a fixed amount to any address, rate limited per
 *     address and capped for the lifetime of the contract.
 *   - The owner may mint up to a hard cap, which is how the reward pool of the
 *     staking contract gets funded. Ownership is expected to be handed over to a
 *     multisig / team address after deployment.
 *
 * WHAT THIS IS NOT
 * ----------------
 *   - It is NOT the OMC mainnet token. It has no value, no sale, no redemption.
 *   - Nothing here promises a return of any kind. Testnet balances are for
 *     testing the protocol, and the site says exactly that.
 *
 * The previously deployed testnet contract
 * (0x3C7EDae9da38b72Db7AE98921eF0759d19dE7Cc5) was a non-transferable points
 * contract: it had `claimFaucet()`, `registerNode()`, `points()` and
 * `submitTask(string)` but NO `transfer` / `approve` / `transferFrom`, so it was
 * impossible to use it as staking collateral. This contract replaces it as the
 * staking token; the old one is kept on chain and documented as legacy.
 */
contract OMCTestToken {
    /* ----------------------------- metadata ----------------------------- */

    string public constant name = "Omniverse Compute Test Token";
    string public constant symbol = "tOMC";
    uint8 public constant decimals = 18;

    /// @dev absolute hard cap; the owner can never mint beyond this
    uint256 public constant MAX_SUPPLY = 1_000_000_000e18;

    /// @dev amount handed out by one `claimFaucet()` call
    uint256 public constant FAUCET_AMOUNT = 100e18;

    /// @dev one claim per address per cooldown window
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    /// @dev lifetime budget of the faucet, so it can never mint the whole cap
    uint256 public constant FAUCET_CAP = 100_000_000e18;

    /// @dev supply minted to the deployer at construction (funds the reward pool)
    uint256 public constant INITIAL_SUPPLY = 10_000_000e18;

    /* ------------------------------- state ------------------------------ */

    address public owner;

    uint256 public totalSupply;
    uint256 public faucetMinted;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @dev unix timestamp from which the address may claim again
    mapping(address => uint256) public lastFaucetAt;
    /// @dev how many times the address has claimed (for stats / UI)
    mapping(address => uint256) public faucetClaims;

    /* ------------------------------- events ----------------------------- */

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Faucet(address indexed to, uint256 amount, uint256 claimIndex);
    event OwnershipTransferred(address indexed from, address indexed to);
    event Burn(address indexed from, uint256 amount);

    /* ------------------------------ modifiers --------------------------- */

    modifier onlyOwner() {
        require(msg.sender == owner, "tOMC: not owner");
        _;
    }

    /* ----------------------------- constructor -------------------------- */

    /// @param initialHolder address receiving INITIAL_SUPPLY (zero = deployer)
    constructor(address initialHolder) {
        owner = msg.sender;
        address to = initialHolder == address(0) ? msg.sender : initialHolder;
        _mint(to, INITIAL_SUPPLY);
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /* ---------------------------- ERC-20 core --------------------------- */

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        require(spender != address(0), "tOMC: zero spender");
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "tOMC: allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /* ------------------------------ faucet ------------------------------ */

    /// @notice claim FAUCET_AMOUNT tOMC; one claim per FAUCET_COOLDOWN per address
    function claimFaucet() external returns (uint256 amount) {
        require(faucetMinted + FAUCET_AMOUNT <= FAUCET_CAP, "tOMC: faucet empty");
        uint256 readyAt = lastFaucetAt[msg.sender] == 0
            ? 0
            : lastFaucetAt[msg.sender] + FAUCET_COOLDOWN;
        require(block.timestamp >= readyAt, "tOMC: cooldown");

        lastFaucetAt[msg.sender] = block.timestamp;
        faucetClaims[msg.sender] += 1;
        faucetMinted += FAUCET_AMOUNT;
        _mint(msg.sender, FAUCET_AMOUNT);

        emit Faucet(msg.sender, FAUCET_AMOUNT, faucetClaims[msg.sender]);
        return FAUCET_AMOUNT;
    }

    /// @notice timestamp at which `who` may claim again (0 = never claimed)
    function faucetReadyAt(address who) external view returns (uint256) {
        if (lastFaucetAt[who] == 0) return 0;
        return lastFaucetAt[who] + FAUCET_COOLDOWN;
    }

    function faucetRemaining() external view returns (uint256) {
        return FAUCET_CAP - faucetMinted;
    }

    /* ---------------------------- owner minting ------------------------- */

    /// @notice mint new supply; used to fund the staking reward pool
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "tOMC: zero to");
        _mint(to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "tOMC: zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /* ----------------------------- internals ---------------------------- */

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "tOMC: zero to");
        uint256 bal = balanceOf[from];
        require(bal >= value, "tOMC: balance");
        unchecked { balanceOf[from] = bal - value; }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "tOMC: zero to");
        require(totalSupply + amount <= MAX_SUPPLY, "tOMC: cap");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        uint256 bal = balanceOf[from];
        require(bal >= amount, "tOMC: balance");
        unchecked { balanceOf[from] = bal - amount; }
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
        emit Burn(from, amount);
    }
}
