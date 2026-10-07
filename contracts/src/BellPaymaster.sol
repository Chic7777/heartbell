// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "account-abstraction/core/BasePaymaster.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice ERC-4337 v0.7 sponsor vouchers. Never holds or signs user account keys.
/// @dev Voucher nonce is the account's UserOperation nonce, enforced by EntryPoint.
///      Sponsor policy must authorize callData before issuing a voucher. This
///      contract binds that complete policy-approved operation, including fees.
contract BellPaymaster is BasePaymaster {
    address public immutable sponsorSigner;
    error InvalidSponsor();
    error InvalidPaymasterData();
    error SponsorCostExceeded();

    constructor(IEntryPoint entryPoint_, address owner_, address sponsorSigner_) BasePaymaster(entryPoint_) {
        if (owner_ == address(0) || sponsorSigner_ == address(0)) revert InvalidSponsor();
        _transferOwnership(owner_);
        sponsorSigner = sponsorSigner_;
    }

    /// @notice EIP-191 sign this hash as a 32-byte message, not a hex text string.
    /// @dev paymasterAndData: address(20) | verificationGas(16) | postOpGas(16)
    ///      | abi.encode(uint48 validAfter,uint48 validUntil,uint256 maxCost,bytes signature).
    function getSponsorHash(PackedUserOperation calldata op, uint48 validAfter, uint48 validUntil, uint256 maxCost)
        public
        view
        returns (bytes32)
    {
        if (op.paymasterAndData.length < PAYMASTER_DATA_OFFSET) revert InvalidPaymasterData();
        return keccak256(
            abi.encode(
                block.chainid,
                address(entryPoint),
                address(this),
                op.sender,
                op.nonce,
                keccak256(op.initCode),
                keccak256(op.callData),
                op.accountGasLimits,
                op.preVerificationGas,
                op.gasFees,
                keccak256(op.paymasterAndData[:PAYMASTER_DATA_OFFSET]),
                validAfter,
                validUntil,
                maxCost
            )
        );
    }

    function _validatePaymasterUserOp(PackedUserOperation calldata op, bytes32, uint256 maximumCost)
        internal
        view
        override
        returns (bytes memory context, uint256 validationData)
    {
        if (
            op.paymasterAndData.length < PAYMASTER_DATA_OFFSET
                || address(bytes20(op.paymasterAndData[:20])) != address(this)
        ) revert InvalidPaymasterData();
        (uint48 validAfter, uint48 validUntil, uint256 maxCost, bytes memory signature) =
            abi.decode(op.paymasterAndData[PAYMASTER_DATA_OFFSET:], (uint48, uint48, uint256, bytes));
        if (validUntil == 0 || validUntil <= validAfter) revert InvalidPaymasterData();
        if (maximumCost > maxCost) revert SponsorCostExceeded();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(getSponsorHash(op, validAfter, validUntil, maxCost));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        bool failed = err != ECDSA.RecoverError.NoError || recovered != sponsorSigner;
        validationData = uint256(failed ? 1 : 0) | (uint256(validUntil) << 160) | (uint256(validAfter) << 208);
        context = "";
    }

    /// @dev Empty context means EntryPoint skips postOp; keep the hook harmless.
    function _postOp(IPaymaster.PostOpMode, bytes calldata, uint256, uint256) internal override {}
}
