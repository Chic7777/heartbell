export function walletAction(method,args=[],value) {
  switch(method){
    case 'createInvitation':return {action:'invite',invitee:args[0],sponsor:false};
    case 'acceptInvitation':return {action:'accept',sponsor:false};
    case 'cancelInvitation':return {action:'cancel',sponsor:false};
    case 'declineInvitation':return {action:'decline',sponsor:false};
    case 'proposePrivateVow':return {action:'privateVow',contentHash:args[0],sponsor:false};
    case 'confirmVow':return {action:'confirm',vowIndex:String(args[0]),sponsor:false};
    case 'deposit':return {action:'deposit',value:String(value),sponsor:false};
    case 'withdrawFrom':return {action:'withdraw',relationId:String(args[0]),sponsor:false};
    case 'requestEnd':return {action:'end',mode:'request',sponsor:false};
    case 'confirmEnd':return {action:'end',mode:'confirm',sponsor:false};
    case 'finalizeEnd':return {action:'end',mode:'finalize',relationId:String(args[0]),sponsor:false};
    default:throw new Error('此操作尚未接入智能账户，不会使用其他钱包代签。');
  }
}
export const chainIdentity=state=>state.chainAddress||state.user;
export function encryptionPeer(relation,owner,chainAddress=owner) {
  if(!relation?.a)return owner;
  const peer=relation.a.toLowerCase()===chainAddress.toLowerCase()?relation.b:relation.a;
  return relation.peerOwner||relation.owners?.[peer]||peer;
}
