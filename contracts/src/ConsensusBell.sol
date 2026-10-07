// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "./RingSBT.sol";

/**
 * @title ConsensusBell
 * @notice On-chain registry for bilateral romantic consensus on BOT Chain (Chain ID 677).
 *
 * A Ring (relationship) exists only when two independent keys have both signed:
 *   createInvitation  ->  acceptInvitation  ->  ACTIVE
 *   requestEnd -> confirmEnd / 7-day timeout -> ARCHIVED
 *
 * Design rules:
 *  - One address can hold at most one ACTIVE Ring.
 *  - A Vow increments `vowCount` ONLY when the partner confirms it.
 *    The count is not counted by any platform; it is counted by two people.
 *  - Bond deposits are always attributable to their depositor and are
 *    withdrawable by each side once the Ring is ARCHIVED. Funds never lock.
 *  - No oracles, no admin key, no upgradeability. Zero external dependencies.
 */
contract ConsensusBell {
    RingSBT public immutable ringSBT;

    constructor() {
        ringSBT = new RingSBT(address(this));
    }
    // ---------------------------------------------------------------- types
    enum Status {
        Active,   // 0: both signed, Ring is live
        Ending,   // 1: one side requested end, waiting for partner or timeout
        Archived  // 2: ended. History is preserved, funds are withdrawable
    }

    struct Relation {
        address a;
        address b;
        uint64 createdAt;
        uint64 endingAt;   // meaningful once status == Ending
        Status status;
        uint32 vowCount;   // grows only via confirmVow
    }

    struct Vow {
        string text;           // the vow itself — a vow is meant to be read by both
        bytes32 contentHash;   // keccak256(text), the proofable fingerprint
        address proposer;
        uint64 proposedAt;
        uint64 confirmedAt;
        bool confirmed;
    }

    // --------------------------------------------------------------- storage
    uint256 public relationCount;                       // total Rings ever created
    mapping(uint256 => Relation) public relations;      // relationId => Relation
    mapping(uint256 => Vow[]) internal vowsOf;          // relationId => vows
    mapping(address => uint256) public activeRelation;  // address => relationId (0 = none)
    mapping(address => address) public pendingInviter;  // invitee => inviter (0 = none)
    mapping(address => address) public pendingInvitee;
    mapping(address => uint64) public invitationExpiresAt;
    mapping(uint256 => address) public endingRequester;
    mapping(uint256 => mapping(address => uint256)) public bondOf; // relationId => person => bond

    uint64 public constant END_DELAY = 7 days;

    // ---------------------------------------------------------------- events
    event InvitationCreated(address indexed inviter, address indexed invitee);
    event InvitationCancelled(address indexed inviter, address indexed invitee);
    event RelationCreated(uint256 indexed relationId, address indexed a, address indexed b, uint64 at);
    event VowProposed(uint256 indexed relationId, uint256 indexed vowIndex, address indexed proposer, bytes32 contentHash);
    event VowConfirmed(uint256 indexed relationId, uint256 indexed vowIndex, address indexed confirmer, uint32 vowCount);
    event EndRequested(uint256 indexed relationId, address indexed by, uint64 endingAt);
    event RelationArchived(uint256 indexed relationId, address indexed by, bool mutual);
    event Deposited(uint256 indexed relationId, address indexed person, uint256 amount, uint256 total);
    event Withdrawn(uint256 indexed relationId, address indexed person, uint256 amount);

    // ---------------------------------------------------------- invitations

    /// @notice Invite someone to share a Ring. The invitee accepts from their own key.
    function createInvitation(address invitee) external {
        require(invitee != msg.sender, "cannot invite yourself");
        require(invitee != address(0), "zero address");
        require(activeRelation[msg.sender] == 0, "you already have a Ring");
        require(activeRelation[invitee] == 0, "they already have a Ring");
        _clearExpiredInvitation(pendingInvitee[msg.sender]);
        _clearExpiredInvitation(invitee);
        require(pendingInvitee[msg.sender] == address(0), "you already have an invitation");
        require(pendingInviter[invitee] == address(0), "they already have an invitation");
        pendingInviter[invitee] = msg.sender;
        pendingInvitee[msg.sender] = invitee;
        invitationExpiresAt[invitee] = uint64(block.timestamp + 1 days);
        emit InvitationCreated(msg.sender, invitee);
    }

    /// @notice The only moment a Ring is born: the SECOND private key signs.
    function acceptInvitation() external {
        address inviter = pendingInviter[msg.sender];
        require(inviter != address(0), "no invitation");
        require(activeRelation[msg.sender] == 0, "you already have a Ring");
        require(block.timestamp < invitationExpiresAt[msg.sender], "invitation expired");
        require(activeRelation[inviter] == 0, "inviter already has a Ring");
        delete pendingInviter[msg.sender];
        delete pendingInvitee[inviter];
        delete invitationExpiresAt[msg.sender];

        uint256 id = ++relationCount;
        relations[id] = Relation({
            a: inviter,
            b: msg.sender,
            createdAt: uint64(block.timestamp),
            endingAt: 0,
            status: Status.Active,
            vowCount: 0
        });
        activeRelation[inviter] = id;
        activeRelation[msg.sender] = id;
        ringSBT.mintPair(id, inviter, msg.sender, bytes32(0));
        emit RelationCreated(id, inviter, msg.sender, uint64(block.timestamp));
    }

    function cancelInvitation() external {
        address invitee = pendingInvitee[msg.sender];
        require(invitee != address(0), "no outgoing invitation");
        _clearInvitation(invitee);
        emit InvitationCancelled(msg.sender, invitee);
    }

    function declineInvitation() external {
        address inviter = pendingInviter[msg.sender];
        require(inviter != address(0), "no invitation");
        _clearInvitation(msg.sender);
        emit InvitationCancelled(inviter, msg.sender);
    }

    function _clearInvitation(address invitee) internal {
        address inviter = pendingInviter[invitee];
        delete pendingInviter[invitee];
        delete pendingInvitee[inviter];
        delete invitationExpiresAt[invitee];
    }

    function _clearExpiredInvitation(address invitee) internal {
        if (invitee != address(0) && invitationExpiresAt[invitee] <= block.timestamp) {
            _clearInvitation(invitee);
        }
    }

    // ------------------------------------------------------------ relations

    /// @notice Full relation state for one person (0 = no Ring).
    function relationOf(address person)
        external
        view
        returns (uint256 id, address a, address b, uint64 createdAt, uint64 endingAt, uint8 status, uint32 vowCount)
    {
        id = activeRelation[person];
        if (id != 0) {
            Relation storage r = relations[id];
            a = r.a;
            b = r.b;
            createdAt = r.createdAt;
            endingAt = r.endingAt;
            status = uint8(r.status);
            vowCount = r.vowCount;
        }
    }

    /// @notice One side asks to end the Ring. History is never erased.
    function requestEnd() external {
        uint256 id = activeRelation[msg.sender];
        require(id != 0, "no Ring");
        Relation storage r = relations[id];
        require(r.status == Status.Active, "not active");
        r.status = Status.Ending;
        endingRequester[id] = msg.sender;
        r.endingAt = uint64(block.timestamp) + END_DELAY;
        emit EndRequested(id, msg.sender, r.endingAt);
    }

    /// @notice The partner agrees to end: archived immediately.
    function confirmEnd() external {
        uint256 id = activeRelation[msg.sender];
        require(id != 0, "no Ring");
        Relation storage r = relations[id];
        require(r.status == Status.Ending, "not ending");
        require(endingRequester[id] != msg.sender, "partner must confirm end");
        r.status = Status.Archived;
        _release(id, r);
        emit RelationArchived(id, msg.sender, true);
    }

    /// @notice Nobody confirmed? The Ring archives itself after the 7-day delay.
    function finalizeEnd(uint256 relationId) external {
        Relation storage r = relations[relationId];
        require(r.status == Status.Ending, "not ending");
        require(block.timestamp >= r.endingAt, "7 days not passed");
        r.status = Status.Archived;
        _release(relationId, r);
        emit RelationArchived(relationId, msg.sender, false);
    }

    /// @notice An archived Ring frees both addresses to create a new Ring.
    /// History stays fully readable: relations[id] is never deleted.
    function _release(uint256 id, Relation storage r) internal {
        delete activeRelation[r.a];
        delete activeRelation[r.b];
    }

    // ----------------------------------------------------------------- vows

    /// @notice Propose a vow. The text lives on chain so BOTH sides read the same words;
    /// its keccak256 fingerprint is the proofable hash.
    function proposeVow(string calldata text) external {
        require(bytes(text).length > 0, "empty vow");
        require(bytes(text).length <= 280, "too long");
        uint256 id = activeRelation[msg.sender];
        require(id != 0, "no Ring");
        require(relations[id].status == Status.Active, "not active");
        vowsOf[id].push(Vow({
            text: text,
            contentHash: keccak256(bytes(text)),
            proposer: msg.sender,
            proposedAt: uint64(block.timestamp),
            confirmedAt: 0,
            confirmed: false
        }));
        emit VowProposed(id, vowsOf[id].length - 1, msg.sender, keccak256(bytes(text)));
    }

    /// @notice Private vow path: clients keep encrypted text off-chain and submit only its hash.
    function proposePrivateVow(bytes32 contentHash) external {
        require(contentHash != bytes32(0), "empty vow hash");
        uint256 id = activeRelation[msg.sender];
        require(id != 0, "no Ring");
        require(relations[id].status == Status.Active, "not active");
        vowsOf[id].push(Vow({
            text: "",
            contentHash: contentHash,
            proposer: msg.sender,
            proposedAt: uint64(block.timestamp),
            confirmedAt: 0,
            confirmed: false
        }));
        emit VowProposed(id, vowsOf[id].length - 1, msg.sender, contentHash);
    }

    /// @notice ONLY the partner's signature makes a vow real. vowCount++ happens here and nowhere else.
    function confirmVow(uint256 vowIndex) external {
        uint256 id = activeRelation[msg.sender];
        require(id != 0, "no Ring");
        Relation storage r = relations[id];
        require(r.status == Status.Active, "not active");
        Vow storage v = vowsOf[id][vowIndex];
        require(v.proposer != address(0), "no such vow");
        require(!v.confirmed, "already confirmed");
        require(v.proposer != msg.sender, "partner must confirm");
        v.confirmed = true;
        v.confirmedAt = uint64(block.timestamp);
        r.vowCount += 1;
        emit VowConfirmed(id, vowIndex, msg.sender, r.vowCount);
    }

    /// @notice Vow getter for frontends and proofs.
    function vowAt(uint256 relationId, uint256 vowIndex)
        external
        view
        returns (string memory text, bytes32 contentHash, address proposer, uint64 proposedAt, uint64 confirmedAt, bool confirmed)
    {
        Vow storage v = vowsOf[relationId][vowIndex];
        return (v.text, v.contentHash, v.proposer, v.proposedAt, v.confirmedAt, v.confirmed);
    }

    /// @notice Total vows ever proposed in this Ring (confirmed count lives in the Relation).
    function vowTotal(uint256 relationId) external view returns (uint256) {
        return vowsOf[relationId].length;
    }

    // ----------------------------------------------------------------- bond

    /// @notice Give a future plan some weight. Always attributable to the depositor.
    function deposit() external payable {
        uint256 id = activeRelation[msg.sender];
        require(id != 0, "no Ring");
        require(relations[id].status == Status.Active, "not active");
        require(msg.value > 0, "zero value");
        bondOf[id][msg.sender] += msg.value;
        emit Deposited(id, msg.sender, msg.value, bondOf[id][msg.sender]);
    }

    /// @notice Once archived, everyone takes back their own remainder. No locks, ever.
    function withdrawFrom(uint256 relationId) external {
        require(relations[relationId].status == Status.Archived, "not archived");
        uint256 amount = bondOf[relationId][msg.sender];
        require(amount > 0, "nothing to withdraw");
        bondOf[relationId][msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdrawn(relationId, msg.sender, amount);
    }
}
