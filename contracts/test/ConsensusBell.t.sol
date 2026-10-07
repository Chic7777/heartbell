// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/ConsensusBell.sol";

contract ConsensusBellTest is Test {
    ConsensusBell bell;
    uint256 constant ALICE = 1;
    uint256 constant SOPHIE = 2;
    uint256 constant EVE = 3;

    function setUp() public {
        bell = new ConsensusBell();
        vm.label(vm.addr(ALICE), "Alice");
        vm.label(vm.addr(SOPHIE), "Sophie");
        vm.label(vm.addr(EVE), "Eve");
    }

    function _invite() internal {
        vm.startBroadcast(ALICE);
        bell.createInvitation(vm.addr(SOPHIE));
        vm.stopBroadcast();
    }

    function _accept() internal returns (uint256 id) {
        vm.startBroadcast(SOPHIE);
        bell.acceptInvitation();
        vm.stopBroadcast();
        id = bell.relationCount();
    }

    function _active(uint256 who) internal view returns (uint256, uint8, uint32) {
        (uint256 id,,, , , uint8 status, uint32 vows) = bell.relationOf(vm.addr(who));
        return (id, status, vows);
    }

    // ------------------------------------------------------------- lifecycle

    function test_FullLifecycle() public {
        _invite();
        assertEq(bell.pendingInviter(vm.addr(SOPHIE)), vm.addr(ALICE));

        uint256 id = _accept();
        assertEq(id, 1);
        assertEq(bell.relationCount(), 1);

        (uint256 aid,, ) = _active(ALICE);
        (uint256 bid,, ) = _active(SOPHIE);
        assertEq(aid, 1);
        assertEq(bid, 1);

        // A vow is NOT real until the partner signs
        vm.startBroadcast(ALICE);
        bell.proposeVow("I choose you, again, in all the ordinary days.");
        vm.stopBroadcast();
        assertEq(bell.vowTotal(1), 1, "proposal is recorded");
        (, , uint32 vowsAfterPropose) = _active(SOPHIE);
        assertEq(vowsAfterPropose, 0, "confirmed count must not move on propose");
        (string memory text0, , , , , bool confirmed0) = bell.vowAt(1, 0);
        assertFalse(confirmed0);
        assertEq(text0, "I choose you, again, in all the ordinary days.");

        // the second signature is the whole point
        vm.startBroadcast(SOPHIE);
        bell.confirmVow(0);
        vm.stopBroadcast();
        (, , uint32 vows) = _active(SOPHIE);
        assertEq(vows, 1, "vowCount increments only on partner signature");

        // both deposit — always attributable
        vm.deal(vm.addr(ALICE), 10 ether);
        vm.deal(vm.addr(SOPHIE), 10 ether);
        vm.startBroadcast(ALICE);
        bell.deposit{value: 3 ether}();
        vm.stopBroadcast();
        vm.startBroadcast(SOPHIE);
        bell.deposit{value: 2 ether}();
        vm.stopBroadcast();
        assertEq(bell.bondOf(1, vm.addr(ALICE)), 3 ether);
        assertEq(bell.bondOf(1, vm.addr(SOPHIE)), 2 ether);

        // end: request by Alice, confirm by Sophie -> archived immediately
        vm.startBroadcast(ALICE);
        bell.requestEnd();
        vm.stopBroadcast();
        (, uint8 statusEnding, ) = _active(ALICE);
        assertEq(statusEnding, uint8(ConsensusBell.Status.Ending));

        uint256 aliceBal0 = vm.addr(ALICE).balance;
        uint256 sophieBal0 = vm.addr(SOPHIE).balance;

        vm.startBroadcast(SOPHIE);
        bell.confirmEnd();
        vm.stopBroadcast();

        (uint256 gone,, ) = _active(ALICE);
        assertEq(gone, 0, "archived frees the address");
        (, , , , ConsensusBell.Status stArchived, ) = bell.relations(1);
        assertEq(uint256(stArchived), uint256(2), "archived");

        // everyone takes back their own remainder — never locked
        vm.startBroadcast(ALICE);
        bell.withdrawFrom(1);
        vm.stopBroadcast();
        vm.startBroadcast(SOPHIE);
        bell.withdrawFrom(1);
        vm.stopBroadcast();
        assertEq(vm.addr(ALICE).balance, aliceBal0 + 3 ether);
        assertEq(vm.addr(SOPHIE).balance, sophieBal0 + 2 ether);

        // history survives the archive
        (, , , , , bool confirmed1) = bell.vowAt(1, 0);
        assertTrue(confirmed1, "archived does not mean erased");
    }

    function test_TimeoutArchivesAfter7Days() public {
        _invite();
        _accept();
        vm.startBroadcast(ALICE);
        bell.requestEnd();
        vm.stopBroadcast();

        vm.startBroadcast(EVE);
        vm.expectRevert(bytes("7 days not passed"));
        bell.finalizeEnd(1);
        vm.stopBroadcast();

        vm.warp(block.timestamp + 7 days + 1);
        vm.startBroadcast(EVE);
        bell.finalizeEnd(1);
        vm.stopBroadcast();
        (, , , , ConsensusBell.Status stTimeout, ) = bell.relations(1);
        assertEq(uint256(stTimeout), uint256(2));
    }

    function test_ArchivedFreesBothToRingAgain() public {
        _invite();
        _accept();
        vm.startBroadcast(SOPHIE);
        bell.requestEnd();
        vm.stopBroadcast();
        vm.warp(block.timestamp + 7 days + 1);
        bell.finalizeEnd(1);
        (, , , , ConsensusBell.Status stFree, ) = bell.relations(1);
        assertEq(uint256(stFree), uint256(2));

        // same two people can start over; count grows only by mutual yes
        _invite();
        uint256 id2 = _accept();
        assertEq(id2, 2, "second Ring by the same two people");
    }

    // -------------------------------------------------------------- reverts

    function test_Reverts() public {
        // invitations
        vm.startBroadcast(ALICE);
        vm.expectRevert(bytes("cannot invite yourself"));
        bell.createInvitation(vm.addr(ALICE));
        bell.createInvitation(vm.addr(SOPHIE));
        vm.stopBroadcast();

        // someone else cannot accept Alice's invitation to Sophie
        vm.startBroadcast(EVE);
        vm.expectRevert(bytes("no invitation"));
        bell.acceptInvitation();
        vm.stopBroadcast();

        // only the second key creates the Ring
        uint256 id = _accept();
        vm.startBroadcast(SOPHIE);
        vm.expectRevert(bytes("no invitation"));
        bell.acceptInvitation();
        vm.stopBroadcast();

        // one active Ring per address
        vm.startBroadcast(ALICE);
        vm.expectRevert(bytes("you already have a Ring"));
        bell.createInvitation(vm.addr(EVE));
        vm.stopBroadcast();
        vm.startBroadcast(EVE);
        vm.expectRevert(bytes("they already have a Ring"));
        bell.createInvitation(vm.addr(SOPHIE));
        vm.stopBroadcast();

        // vows
        vm.startBroadcast(EVE);
        vm.expectRevert(bytes("no Ring"));
        bell.proposeVow("x");
        vm.stopBroadcast();
        vm.startBroadcast(SOPHIE);
        bell.proposeVow("ours");
        vm.stopBroadcast();
        vm.startBroadcast(SOPHIE);
        vm.expectRevert(bytes("partner must confirm"));
        bell.confirmVow(0);
        vm.stopBroadcast();
        vm.startBroadcast(ALICE);
        bell.confirmVow(0);
        vm.expectRevert(bytes("already confirmed"));
        bell.confirmVow(0);
        vm.stopBroadcast();

        // bond
        vm.deal(vm.addr(ALICE), 1 ether);
        vm.startBroadcast(ALICE);
        vm.expectRevert(bytes("zero value"));
        bell.deposit{value: 0}();
        vm.stopBroadcast();
        assertEq(bell.bondOf(id, vm.addr(EVE)), 0);

        // end rules
        vm.startBroadcast(ALICE);
        vm.expectRevert(bytes("not ending"));
        bell.confirmEnd();
        bell.requestEnd();
        vm.expectRevert(bytes("partner must confirm end"));
        bell.confirmEnd();
        vm.expectRevert(bytes("not active"));
        bell.proposeVow("too late");
        vm.expectRevert(bytes("not active"));
        bell.deposit{value: 0.1 ether}();
        vm.stopBroadcast();

        // withdraw only from archived
        vm.startBroadcast(ALICE);
        vm.expectRevert(bytes("not archived"));
        bell.withdrawFrom(id);
        vm.stopBroadcast();
    }

    function test_CounterNeverMovesWithoutBothKeys() public {
        assertEq(bell.relationCount(), 0, "no Ring before the mutual yes");
        _invite();
        assertEq(bell.relationCount(), 0, "still zero: one signature is not a Ring");
        _accept();
        assertEq(bell.relationCount(), 1, "exactly one: two signatures");
    }
}
