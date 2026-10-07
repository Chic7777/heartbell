// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/ConsensusBell.sol";
import "../src/BellPaymaster.sol";

contract DeployV2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address operator = vm.addr(deployerKey);
        address entryPoint = vm.envOr("BOT_ENTRYPOINT_ADDRESS", address(0x0000000071727De22E5E9d8BAf0edAc6f37da032));
        address sponsorSigner = vm.envAddress("BELL_SPONSOR_SIGNER_ADDRESS");
        uint256 depositWei = vm.envOr("BELL_PAYMASTER_DEPOSIT_WEI", uint256(0));
        require(block.chainid == 677 || block.chainid == 31337, "unsupported deployment chain");
        vm.startBroadcast(deployerKey);
        ConsensusBell bell = new ConsensusBell();
        BellPaymaster paymaster = new BellPaymaster(IEntryPoint(entryPoint), operator, sponsorSigner);
        if (depositWei > 0) paymaster.deposit{value: depositWei}();
        vm.stopBroadcast();
        console.log("ConsensusBell", address(bell));
        console.log("RingSBT", address(bell.ringSBT()));
        console.log("BellPaymaster", address(paymaster));
    }
}
