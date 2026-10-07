// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "forge-std/Test.sol";
import "../src/ConsensusBell.sol";

contract AuthorityTest is Test {
    ConsensusBell bell;
    address alice = address(0xA11CE);
    address sophie = address(0xB0B);
    address eve = address(0xE1E1);

    function setUp() public { bell = new ConsensusBell(); }

    function test_PrivateVowStoresOnlyHash() public {
        vm.prank(alice); bell.createInvitation(sophie);
        vm.prank(sophie); bell.acceptInvitation();
        bytes32 commitment = keccak256("A private promise");
        vm.prank(alice); bell.proposePrivateVow(commitment);
        (string memory text, bytes32 storedHash,,,,) = bell.vowAt(1,0);
        assertEq(bytes(text).length,0);
        assertEq(storedHash,commitment);
    }

    function test_OutgoingInvitationIsUniqueAndCancellable() public {
        vm.prank(alice); bell.createInvitation(sophie);
        vm.prank(alice); vm.expectRevert("you already have an invitation");
        bell.createInvitation(eve);
        vm.prank(eve); vm.expectRevert("no outgoing invitation");
        bell.cancelInvitation();
        vm.prank(alice); bell.cancelInvitation();
        assertEq(bell.pendingInviter(sophie),address(0));
        vm.prank(alice); bell.createInvitation(eve);
    }

    function test_ExpiredInvitationCannotBeAcceptedAndCanBeReplaced() public {
        vm.prank(alice); bell.createInvitation(sophie);
        vm.warp(block.timestamp + 1 days);
        vm.prank(sophie); vm.expectRevert("invitation expired");
        bell.acceptInvitation();
        vm.prank(alice); bell.createInvitation(eve);
        assertEq(bell.pendingInvitee(alice),eve);
    }

    function test_RequesterCannotConfirmTheirOwnEnding() public {
        vm.prank(alice); bell.createInvitation(sophie);
        vm.prank(sophie); bell.acceptInvitation();
        vm.prank(alice); bell.requestEnd();
        vm.prank(alice);
        vm.expectRevert("partner must confirm end");
        bell.confirmEnd();
        vm.prank(sophie); bell.confirmEnd();
    }

    function test_InviteeCannotOverwriteAnExistingRing() public {
        vm.prank(alice); bell.createInvitation(sophie);
        vm.prank(sophie); bell.createInvitation(eve);
        vm.prank(eve); bell.acceptInvitation();
        vm.prank(sophie);
        vm.expectRevert("you already have a Ring");
        bell.acceptInvitation();
    }
}
