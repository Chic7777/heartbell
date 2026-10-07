// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import "../src/ConsensusBell.sol";

/// @notice Deploy ConsensusBell to BOT Chain (Chain ID 677).
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url bot --broadcast --slow -vvvv
/// Private key comes from .env (DEPLOYER_KEY), funded with BOT for gas.
contract Deploy is Script {
    function run() external returns (ConsensusBell bell) {
        uint256 key = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(key);
        bell = new ConsensusBell();
        vm.stopBroadcast();
        console2.log("ConsensusBell deployed at:", address(bell));
        console2.log("Chain ID:", block.chainid);
    }
}
