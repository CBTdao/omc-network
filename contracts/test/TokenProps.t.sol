// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PropTest} from "./Vm.sol";
import {OMCTestToken} from "../OMCTestToken.sol";

/// @title property tests for tOMC (OMCTestToken.sol)
contract TokenPropsTest is PropTest {
    OMCTestToken token;

    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant CAROL = address(0xCA401);

    function setUp() public {
        token = new OMCTestToken(address(this));
        token.transfer(ALICE, 1_000_000e18);
    }

    /* --------------------------- supply invariant ------------------------ */

    /// @dev a transfer must move exactly `value` and change nothing about the
    ///      total supply — the classic ERC-20 conservation property
    function testFuzz_transfer_conservesSupply(uint96 rawValue) public {
        uint256 value = bound(uint256(rawValue), 0, 1_000_000e18);

        uint256 supplyBefore = token.totalSupply();
        uint256 aliceBefore = token.balanceOf(ALICE);
        uint256 bobBefore = token.balanceOf(BOB);

        vm.prank(ALICE);
        bool ok = token.transfer(BOB, value);
        assertTrue(ok, "transfer returned false");

        assertEq(token.balanceOf(ALICE), aliceBefore - value, "sender debited wrong");
        assertEq(token.balanceOf(BOB), bobBefore + value, "recipient credited wrong");
        assertEq(token.totalSupply(), supplyBefore, "totalSupply changed on transfer");
    }

    /// @dev the whole point of the `require(bal >= value)` in _transfer: the
    ///      `unchecked` block below it can never underflow
    function testFuzz_transfer_revertsAboveBalance(uint96 rawValue) public {
        uint256 bal = token.balanceOf(ALICE);
        uint256 value = bound(uint256(rawValue), bal + 1, type(uint96).max);

        assertRevertsAs(
            ALICE,
            address(token),
            abi.encodeWithSelector(OMCTestToken.transfer.selector, BOB, value),
            "transfer above balance did not revert"
        );
        assertEq(token.balanceOf(ALICE), bal, "balance changed on a reverted transfer");
    }

    /// @dev the mint cap is absolute: no sequence of mints can cross MAX_SUPPLY
    function testFuzz_mint_neverCrossesMaxSupply(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, type(uint96).max);

        uint256 minted = token.totalSupply();
        uint256 remaining = token.MAX_SUPPLY() - minted;

        if (amount > remaining) {
            assertReverts(
                address(token),
                abi.encodeWithSelector(OMCTestToken.mint.selector, BOB, amount),
                "mint above MAX_SUPPLY did not revert"
            );
        } else {
            token.mint(BOB, amount);
            assertEq(token.totalSupply(), minted + amount, "supply did not grow by amount");
        }
        assertLe(token.totalSupply(), token.MAX_SUPPLY(), "MAX_SUPPLY crossed");
    }

    /* ------------------------------ faucet ------------------------------- */

    /// @dev published rule: 20 tOMC per claim, one claim per day, 5 claims per
    ///      address for the lifetime of the contract. This is the rule the site
    ///      prints, so it is asserted here rather than assumed.
    function testFuzz_faucet_enforcesLifetimeCapAndCooldown(uint8 claims, uint32 gap) public {
        uint256 n = bound(uint256(claims), 0, 8);
        uint256 wait = bound(uint256(gap), 0, 3 days);

        for (uint256 i = 0; i < 8; i++) {
            if (i > 0) vm.warp(block.timestamp + wait);
            if (i < n) {
                vm.prank(CAROL);
                token.claimFaucet();
            }
        }

        uint256 paid = n > 5 ? 5 : n;
        assertEq(token.faucetClaims(CAROL), paid, "lifetime claim cap not enforced");
        assertEq(token.balanceOf(CAROL), paid * token.FAUCET_AMOUNT(), "faucet amount wrong");
        assertLe(token.faucetMinted(), token.FAUCET_CAP(), "faucet cap crossed");
    }

    /// @dev a second claim inside the cooldown window must revert
    function test_faucet_secondClaimInsideCooldownReverts() public {
        vm.prank(CAROL);
        token.claimFaucet();

        assertRevertsAs(
            CAROL,
            address(token),
            abi.encodeWithSelector(OMCTestToken.claimFaucet.selector),
            "re-claim inside cooldown did not revert"
        );

        vm.warp(block.timestamp + token.FAUCET_COOLDOWN());
        vm.prank(CAROL);
        token.claimFaucet();
        assertEq(token.faucetClaims(CAROL), 2, "claim after cooldown not counted");
    }

    /* ----------------------------- metadata ------------------------------ */

    /// @dev the site hardcodes these in JS; they must agree with the contract
    function test_metadata_matchesPublishedValues() public view {
        assertEq(keccak256(bytes(token.symbol())), keccak256("tOMC"), "symbol");
        assertEq(token.decimals(), 18, "decimals");
        assertEq(token.FAUCET_AMOUNT(), 20e18, "faucet amount");
        assertEq(token.FAUCET_COOLDOWN(), 1 days, "faucet cooldown");
        assertEq(token.MAX_FAUCET_CLAIMS(), 5, "lifetime claim cap");
    }
}
