// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Heartbell V2 承诺登记合约（计划书 9.5 节）。
/// @notice 链上只登记带独立随机秘密的内容承诺（bytes32 commitment）。
///         交易输入、存储和事件不包含用户钱包、普通签名、关系类型或链下关系 ID。
/// @dev 旧 HeartbellMemories.sol（公开双地址）保留为 V1 兼容只读，V2 使用独立 ABI 与地址。
contract HeartbellCommitmentRegistry {
    address public admin;
    address public pendingAdmin;
    address public writer;
    bool public paused;

    // 私有变量不代表隐私：观察者仍可从事件与存储证明读取；敏感数据本来就不写入。
    mapping(bytes32 => uint64) private _recordedAt;

    event CommitmentRecorded(bytes32 indexed commitment, uint64 recordedAt);
    event WriterRotated(address indexed previousWriter, address indexed newWriter);
    event PauseToggled(bool paused);
    event AdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    error NotAdmin();
    error NotWriter();
    error ContractPaused();
    error ZeroCommitment();
    error AlreadyRecorded();
    error ZeroAddress();
    error NoPendingAdmin();

    modifier onlyAdmin() { if (msg.sender != admin) revert NotAdmin(); _; }
    modifier onlyWriter() { if (msg.sender != writer) revert NotWriter(); _; }
    modifier whenNotPaused() { if (paused) revert ContractPaused(); _; }

    constructor(address initialAdmin, address initialWriter) {
        if (initialAdmin == address(0) || initialWriter == address(0)) revert ZeroAddress();
        admin = initialAdmin;
        writer = initialWriter;
    }

    /// @notice 受控 writer 登记一个承诺；每个承诺只能写入一次，时间只增不改。
    function record(bytes32 commitment) external onlyWriter whenNotPaused {
        if (commitment == bytes32(0)) revert ZeroCommitment();
        if (_recordedAt[commitment] != 0) revert AlreadyRecorded();
        _recordedAt[commitment] = uint64(block.timestamp);
        emit CommitmentRecorded(commitment, uint64(block.timestamp));
    }

    /// @notice 只读查询登记时间；0 表示未登记。
    function recordedAt(bytes32 commitment) external view returns (uint64) {
        return _recordedAt[commitment];
    }

    /// @notice 管理员轮换 writer（两步式管理员转移见 transferAdmin/acceptAdmin）。
    function rotateWriter(address newWriter) external onlyAdmin {
        if (newWriter == address(0)) revert ZeroAddress();
        emit WriterRotated(writer, newWriter);
        writer = newWriter;
    }

    function setPaused(bool value) external onlyAdmin {
        paused = value;
        emit PauseToggled(value);
    }

    /// @notice 两步式管理员转移：先 transferAdmin，新管理员再 acceptAdmin。
    function transferAdmin(address nextAdmin) external onlyAdmin {
        if (nextAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = nextAdmin;
        emit AdminTransferStarted(admin, nextAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NoPendingAdmin();
        emit AdminTransferred(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    // 不提供删除、修改历史、资金接收或转账接口；合约不保存关系、分数或保险余额。
    receive() external payable { revert(); }
    fallback() external payable { revert(); }
}
