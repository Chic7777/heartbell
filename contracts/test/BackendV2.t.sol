// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/RingSBT.sol";
import "../src/BellPaymaster.sol";
import "../src/ConsensusBell.sol";
import "account-abstraction/core/EntryPoint.sol";
import "account-abstraction/samples/SimpleAccountFactory.sol";

contract V2Target {
    uint256 public calls;

    function ping() external {
        ++calls;
    }
}

contract BackendV2Test is Test {
    uint256 constant SPONSOR_KEY = 123;
    uint256 constant USER_KEY = 456;
    EntryPoint ep;
    BellPaymaster paymaster;
    SimpleAccount account;
    V2Target target;
    RingSBT ring;

    receive() external payable {}

    function setUp() public {
        ep = new EntryPoint();
        paymaster = new BellPaymaster(ep, address(this), vm.addr(SPONSOR_KEY));
        SimpleAccountFactory factory = new SimpleAccountFactory(ep);
        account = factory.createAccount(vm.addr(USER_KEY), 0);
        target = new V2Target();
        ring = new RingSBT(address(this));
        vm.deal(address(this), 10 ether);
        paymaster.deposit{value: 1 ether}();
        vm.warp(100);
    }

    function _signature(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, MessageHashUtils.toEthSignedMessageHash(digest));
        return abi.encodePacked(r, s, v);
    }

    function _operation(uint48 validAfter, uint48 validUntil) internal view returns (PackedUserOperation memory op) {
        op.sender = address(account);
        op.nonce = ep.getNonce(address(account), 0);
        op.callData = abi.encodeCall(SimpleAccount.execute, (address(target), 0, abi.encodeCall(V2Target.ping, ())));
        op.accountGasLimits = bytes32((uint256(1_000_000) << 128) | 1_000_000);
        op.preVerificationGas = 50_000;
        op.gasFees = bytes32((uint256(1 gwei) << 128) | 1 gwei);
        bytes memory prefix = abi.encodePacked(address(paymaster), uint128(300_000), uint128(0));
        op.paymasterAndData = prefix;
        bytes memory signature = _signature(SPONSOR_KEY, paymaster.getSponsorHash(op, validAfter, validUntil, 1 ether));
        op.paymasterAndData = bytes.concat(prefix, abi.encode(validAfter, validUntil, uint256(1 ether), signature));
        op.signature = _signature(USER_KEY, ep.getUserOpHash(op));
    }

    function _validate(PackedUserOperation memory op) internal returns (uint256 data) {
        bytes32 operationHash = ep.getUserOpHash(op);
        vm.prank(address(ep));
        (, data) = paymaster.validatePaymasterUserOp(op, operationHash, 0.01 ether);
    }

    function _handle(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        ep.handleOps(ops, payable(address(this)));
    }

    function testPairSharesRelationAndCannotTransfer() public {
        ring.mintPair(7, address(account), vm.addr(USER_KEY), keccak256("receipt"));
        assertEq(ring.ownerOf(13), address(account));
        assertEq(ring.ownerOf(14), vm.addr(USER_KEY));
        assertEq(ring.relationOf(13), 7);
        assertEq(ring.relationOf(14), 7);
        assertEq(ring.metadataHash(13), ring.metadataHash(14));
        assertTrue(ring.locked(13));
        assertTrue(ring.supportsInterface(0x80ac58cd));
        assertTrue(ring.supportsInterface(0xb45a3c0e));
        vm.expectRevert(RingSBT.NonTransferable.selector);
        vm.prank(vm.addr(USER_KEY));
        ring.transferFrom(vm.addr(USER_KEY), address(this), 14);
        vm.expectRevert(RingSBT.NonTransferable.selector);
        vm.prank(vm.addr(USER_KEY));
        ring.safeTransferFrom(vm.addr(USER_KEY), address(this), 14);
        vm.expectRevert(RingSBT.NonTransferable.selector);
        ring.approve(address(this), 13);
        vm.expectRevert(RingSBT.NonTransferable.selector);
        ring.setApprovalForAll(address(this), true);
    }

    function testRegistryAcceptanceMintsPairAndArchivePreservesReceipt() public {
        ConsensusBell registry = new ConsensusBell();
        address a = vm.addr(USER_KEY);
        address b = vm.addr(SPONSOR_KEY);
        vm.prank(a);
        registry.createInvitation(b);
        vm.prank(b);
        registry.acceptInvitation();
        RingSBT receipt = registry.ringSBT();
        assertEq(receipt.registry(), address(registry));
        assertEq(receipt.ownerOf(1), a);
        assertEq(receipt.ownerOf(2), b);
        assertEq(receipt.relationOf(1), registry.relationCount());
        assertEq(receipt.relationOf(2), registry.relationCount());
        vm.prank(a);
        registry.requestEnd();
        vm.prank(b);
        registry.confirmEnd();
        assertEq(registry.activeRelation(a), 0);
        assertEq(receipt.ownerOf(1), a);
        assertEq(receipt.ownerOf(2), b);
        assertTrue(receipt.locked(1));
    }

    function testRegistryOnlyAndDuplicatePair() public {
        vm.expectRevert(RingSBT.RegistryOnly.selector);
        vm.prank(vm.addr(USER_KEY));
        ring.mintPair(1, address(this), address(account), bytes32(0));
        ring.mintPair(1, address(this), address(account), bytes32(0));
        vm.expectRevert(RingSBT.InvalidPair.selector);
        ring.mintPair(1, address(this), address(account), bytes32(0));
    }

    function testSponsoredOperationRunsAndReplayFailsAtEntryPoint() public {
        PackedUserOperation memory op = _operation(50, 200);
        _handle(op);
        assertEq(target.calls(), 1);
        assertEq(ep.getNonce(address(account), 0), 1);
        assertLt(paymaster.getDeposit(), 1 ether);
        assertEq(address(account).balance, 0);
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA25 invalid account nonce"));
        _handle(op);
        assertEq(target.calls(), 1);
    }

    function testVoucherBindsSenderNonceCallDataInitCodeAndGas() public {
        PackedUserOperation memory op = _operation(50, 200);
        assertEq(uint160(_validate(op)), 0);
        op.sender = address(0x1234);
        assertEq(uint160(_validate(op)), 1);
        op = _operation(50, 200);
        op.nonce = 1;
        assertEq(uint160(_validate(op)), 1);
        op = _operation(50, 200);
        op.callData = hex"abcd";
        assertEq(uint160(_validate(op)), 1);
        op = _operation(50, 200);
        op.initCode = hex"abcd";
        assertEq(uint160(_validate(op)), 1);
        op = _operation(50, 200);
        op.accountGasLimits = bytes32(uint256(1));
        assertEq(uint160(_validate(op)), 1);
        op = _operation(50, 200);
        op.gasFees = bytes32(uint256(2));
        assertEq(uint160(_validate(op)), 1);
        op = _operation(50, 200);
        op.preVerificationGas += 1;
        assertEq(uint160(_validate(op)), 1);
        op = _operation(50, 200);
        op.paymasterAndData[35] = bytes1(uint8(1));
        assertEq(uint160(_validate(op)), 1);
    }

    function testVoucherTimeWindowEnforcedByActualEntryPoint() public {
        PackedUserOperation memory expired = _operation(50, 99);
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA32 paymaster expired or not due"));
        _handle(expired);
        PackedUserOperation memory future = _operation(101, 200);
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA32 paymaster expired or not due"));
        _handle(future);
    }

    function testEntryPointOnlyCostLimitAndChainBinding() public {
        PackedUserOperation memory op = _operation(50, 200);
        vm.expectRevert("Sender not EntryPoint");
        paymaster.validatePaymasterUserOp(op, bytes32(0), 1);
        vm.expectRevert(BellPaymaster.SponsorCostExceeded.selector);
        vm.prank(address(ep));
        paymaster.validatePaymasterUserOp(op, bytes32(0), 1 ether + 1);
        vm.chainId(block.chainid + 1);
        assertEq(uint160(_validate(op)), 1);
        vm.expectRevert("Sender not EntryPoint");
        paymaster.postOp(IPaymaster.PostOpMode.opSucceeded, "", 0, 0);
    }

    function testOwnerControlsSponsorFundsOnly() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, vm.addr(USER_KEY)));
        vm.prank(vm.addr(USER_KEY));
        paymaster.withdrawTo(payable(vm.addr(USER_KEY)), 1);
        paymaster.withdrawTo(payable(address(this)), 0.1 ether);
        assertEq(paymaster.getDeposit(), 0.9 ether);
    }

    function testVoucherCannotCrossEntryPointOrPaymasterDomain() public {
        PackedUserOperation memory op = _operation(50, 200);
        EntryPoint otherEntryPoint = new EntryPoint();
        BellPaymaster otherPaymaster = new BellPaymaster(otherEntryPoint, address(this), vm.addr(SPONSOR_KEY));
        assertTrue(
            paymaster.getSponsorHash(op, 50, 200, 1 ether) != otherPaymaster.getSponsorHash(op, 50, 200, 1 ether)
        );
        bytes memory originalData = op.paymasterAndData;
        op.paymasterAndData = abi.encodePacked(address(otherPaymaster), uint128(300_000), uint128(0));
        for (uint256 i = 52; i < originalData.length; ++i) {
            op.paymasterAndData = bytes.concat(op.paymasterAndData, originalData[i]);
        }
        vm.prank(address(otherEntryPoint));
        (, uint256 data) = otherPaymaster.validatePaymasterUserOp(op, bytes32(0), 0.01 ether);
        assertEq(uint160(data), 1);
        vm.expectRevert();
        new BellPaymaster(IEntryPoint(address(target)), address(this), vm.addr(SPONSOR_KEY));
    }

    function testExpiryAndSignerCannotBeAltered() public {
        PackedUserOperation memory op = _operation(50, 200);
        (,,, bytes memory signature) = abi.decode(_voucherData(op.paymasterAndData), (uint48, uint48, uint256, bytes));
        op.paymasterAndData = bytes.concat(
            abi.encodePacked(address(paymaster), uint128(300_000), uint128(0)),
            abi.encode(uint48(50), uint48(300), uint256(1 ether), signature)
        );
        assertEq(uint160(_validate(op)), 1);
        bytes memory wrongSignature = _signature(USER_KEY, paymaster.getSponsorHash(op, 50, 300, 1 ether));
        op.paymasterAndData = bytes.concat(
            abi.encodePacked(address(paymaster), uint128(300_000), uint128(0)),
            abi.encode(uint48(50), uint48(300), uint256(1 ether), wrongSignature)
        );
        assertEq(uint160(_validate(op)), 1);
    }

    function _voucherData(bytes memory data) internal pure returns (bytes memory result) {
        result = new bytes(data.length - 52);
        for (uint256 i = 52; i < data.length; ++i) {
            result[i - 52] = data[i];
        }
    }
}
