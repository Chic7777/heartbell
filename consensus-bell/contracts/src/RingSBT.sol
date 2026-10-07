// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Permanent bilateral relationship receipts. Only the registry can mint.
/// @dev Uses _mint deliberately: smart accounts need not implement ERC721Receiver,
///      and creating a relationship must never execute a receiver callback.
contract RingSBT is ERC721 {
    address public immutable registry;
    mapping(uint256 => uint256) public relationOf;
    mapping(uint256 => bytes32) public metadataHash;
    mapping(uint256 => bool) public mintedRelation;

    error RegistryOnly();
    error NonTransferable();
    error InvalidPair();
    event Locked(uint256 tokenId);
    event PairMinted(uint256 indexed relationId, uint256 firstTokenId, uint256 secondTokenId, bytes32 metadataHash);

    constructor(address registry_) ERC721("Consensus Bell Ring", "RING") {
        require(registry_ != address(0), "zero registry");
        registry = registry_;
    }

    function mintPair(uint256 relationId, address a, address b, bytes32 contentHash) external {
        if (msg.sender != registry) revert RegistryOnly();
        if (relationId == 0 || a == address(0) || b == address(0) || a == b || mintedRelation[relationId]) {
            revert InvalidPair();
        }
        mintedRelation[relationId] = true;
        uint256 first = relationId * 2 - 1;
        uint256 second = first + 1;
        relationOf[first] = relationId;
        relationOf[second] = relationId;
        metadataHash[first] = contentHash;
        metadataHash[second] = contentHash;
        _mint(a, first);
        _mint(b, second);
        emit Locked(first);
        emit Locked(second);
        emit PairMinted(relationId, first, second, contentHash);
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }

    function approve(address, uint256) public pure override {
        revert NonTransferable();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert NonTransferable();
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert NonTransferable();
        return super._update(to, tokenId, auth);
    }
}
