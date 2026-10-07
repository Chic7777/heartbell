import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getUserOperationHash} from 'viem/account-abstraction';
import {BOT_NETWORKS} from './bot-network.mjs';
import {sdkOperation,createPrivyAdapter,createWalletAdapter} from './wallet-adapter.mjs';
import {userOpHash} from './aa-protocol.mjs';
import {identityProviderConfig} from './auth-provider.mjs';

const owner='0x000000000000000000000000000000000000dEaD';
test('v0.7 SDK hash agrees with backend for deployment and Paymaster integer fields',()=>{
  const network=BOT_NETWORKS[968],op={sender:owner,nonce:'0x0',callData:'0x1234',factory:network.factory,factoryData:'0x1234',callGasLimit:'0x123',verificationGasLimit:'0x234',preVerificationGas:'0x345',maxFeePerGas:'0x12',maxPriorityFeePerGas:'0x1',paymaster:owner,paymasterVerificationGasLimit:'0x234',paymasterPostOpGasLimit:'0x23',paymasterData:'0x5678',signature:'0x'};
  const sdk=sdkOperation(op);assert.equal(sdk.nonce,0n);assert.equal(sdk.paymasterVerificationGasLimit,564n);
  assert.equal(getUserOperationHash({chainId:968,entryPointAddress:network.entryPoint,entryPointVersion:'0.7',userOperation:sdk}),userOpHash(op,network.entryPoint,968));
});
test('Privy adapter rejects external wallets before network or signature requests',async()=>{
  let switched=false;await assert.rejects(createPrivyAdapter({wallet:{walletClientType:'metamask',switchChain:()=>{switched=true;}},config:BOT_NETWORKS[968]}),/Privy embedded/);assert.equal(switched,false);
});
test('signer chain mismatch stops before public RPC access',async()=>{
  const provider={request:async({method})=>method==='eth_accounts'?[owner]:'0x2a5'};
  await assert.rejects(createWalletAdapter({provider,ownerAddress:owner,config:{...BOT_NETWORKS[968],rpc:'http://127.0.0.1:1'}}),/another chain/);
});
test('Privy configuration fixes issuer algorithm and app audience while generic OIDC remains separate',()=>{
  const privy=identityProviderConfig({PRIVY_APP_ID:'cmuxf6vmm003c0bjrt2ejmqpm',AUTH_AUDIENCE:'wrong-app'});
  assert.equal(privy.issuer,'privy.io');assert.equal(privy.audience,'cmuxf6vmm003c0bjrt2ejmqpm');assert.deepEqual(privy.algorithms,['ES256']);assert.equal(privy.maxTokenAge,'1h');
  assert.equal(identityProviderConfig({AUTH_ISSUER:'https://issuer',AUTH_AUDIENCE:'generic',AUTH_JWKS_URL:'https://issuer/keys'}).audience,'generic');
});
