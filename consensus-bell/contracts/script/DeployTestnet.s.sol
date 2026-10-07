// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/ConsensusBell.sol";

contract DeployTestnet is Script {
    function run() external {
        require(block.chainid == 968 || block.chainid == 31337, "testnet deployment only");
        vm.startBroadcast(vm.envUint("DEPLOYER_KEY"));
        ConsensusBell bell = new ConsensusBell();
        vm.stopBroadcast();
        console.log("ConsensusBell", address(bell));
        console.log("RingSBT", address(bell.ringSBT()));
    }
}
