// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Each participant approves the same immutable memory via their own transaction.
/// @dev Wallet addresses/approval timing are public; this contract does not provide ZK privacy.
contract HeartbellMemories {
    struct Memory {
        bytes32 contentHash;
        address participantA;
        address participantB;
        bool approvedA;
        bool approvedB;
        uint64 confirmedAt;
    }
    mapping(bytes32 => Memory) public memories;
    event MemoryApproved(bytes32 indexed id, address indexed participant);
    event MemoryConfirmed(bytes32 indexed id, bytes32 contentHash, uint64 timestamp);

    function approveMemory(bytes32 id, bytes32 contentHash, address a, address b) external {
        require(id != bytes32(0) && contentHash != bytes32(0), "Empty memory");
        require(a != address(0) && b != address(0) && a != b, "Invalid participants");
        require(msg.sender == a || msg.sender == b, "Not participant");
        // ID binds both accounts and content; outsiders cannot squat a random draft ID.
        require(id == keccak256(abi.encode(contentHash, a, b)), "Invalid ID");
        Memory storage m = memories[id];
        if (m.participantA == address(0)) {
            m.contentHash = contentHash; m.participantA = a; m.participantB = b;
        }
        require(m.contentHash == contentHash && m.participantA == a && m.participantB == b, "Content mismatch");
        if (msg.sender == a) { require(!m.approvedA, "Already approved"); m.approvedA = true; }
        else { require(!m.approvedB, "Already approved"); m.approvedB = true; }
        emit MemoryApproved(id, msg.sender);
        if (m.approvedA && m.approvedB) {
            m.confirmedAt = uint64(block.timestamp);
            emit MemoryConfirmed(id, contentHash, m.confirmedAt);
        }
    }
}
