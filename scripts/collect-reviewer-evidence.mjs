// Read-only evidence collection with the checked-in GenLayerJS dependency.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
// Each later run must use a fresh directory so historical failures are retained.
const root = process.argv[2];
if (!root || existsSync(root)) throw new Error('Supply a new evidence directory; existing captures must not be overwritten.');
const address = '0x055F97140CE35FD1e656ebb3D204952A46646681';
const funding = '0xef9d035c4d7714774fda42efa72b07d02a89dda851d8ab7dac5ac8366c2e3c56';
const deployment = '0xed523aaf12afa7633651f82f9ed1cafc0d133a1712faa5f48b57a7c5f1958d15';
const json = v => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2);
const save = (path, v) => { const p = `${root}/${path}`; mkdirSync(p.slice(0,p.lastIndexOf('/')), {recursive:true}); writeFileSync(p, typeof v === 'string' ? v : json(v)); };
const sha = x => createHash('sha256').update(x).digest('hex');
const realFetch = globalThis.fetch;
let counter = 0;
globalThis.fetch = async (input, init) => {
  const response = await realFetch(input, init);
  const url = typeof input === 'string' ? input : input.url || String(input);
  if (url.includes('genlayer.com')) {
    const id = String(++counter).padStart(3,'0');
    save(`rpc/${id}.json`, {retrieved_at_utc:new Date().toISOString(),url,request: init?.body || null,http_status:response.status,response:await response.clone().text()});
  }
  return response;
};
const client = createClient({chain:testnetBradbury});
async function capture(path, fn) {
  try { const value = await fn(); save(path, {retrieved_at_utc:new Date().toISOString(),result:value}); console.log(path, 'saved'); return value; }
  catch(e) { save(path,{retrieved_at_utc:new Date().toISOString(),error:{name:e.name,message:e.message,details:e.details}}); console.log(path,'ERROR',e.shortMessage || e.message.slice(0,200)); }
}
await capture(`transactions/funding/${funding}/transaction-raw.json`,()=>client.getTransaction({hash:funding}));
await capture('deployment/contract-deployment.json',()=>client.getTransaction({hash:deployment}));
await capture('deployment/version-read.json',()=>client.readContract({address,functionName:'version',args:[],transactionHashVariant:'latest-final'}));
await capture('transactions/policies-finalized.json',()=>client.readContract({address,functionName:'get_policies',args:[],transactionHashVariant:'latest-final'}));
await capture('deployment/chain-id.json',()=>client.request({method:'eth_chainId',params:[]}));
await capture('deployment/contract-code.json',()=>client.request({method:'gen_getContractCode',params:[{address,status:'finalized'}]}));
const url='https://nimbuspact.vercel.app';
const htmlResponse=await realFetch(url); const html=Buffer.from(await htmlResponse.arrayBuffer());
save('deployment/production.html',html.toString());
const assets=[...html.toString().matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map(m=>new URL(m[1],url).href);
const assetEvidence=[];
for (const asset of assets) { const response=await realFetch(asset); const bytes=Buffer.from(await response.arrayBuffer()); save(`deployment/assets/${asset.split('/').pop()}`,bytes.toString()); assetEvidence.push({url:asset,sha256:sha(bytes),http_status:response.status}); }
save('deployment/production-attestation.json',{production_url:url,retrieved_at_utc:new Date().toISOString(),repository_head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),production_deployment_identifier:null,immutable_deployment_url:null,loaded_assets:assetEvidence,html_sha256:sha(html),main_js_sha256:assetEvidence.find(a=>a.url.endsWith('.js'))?.sha256,headers:Object.fromEntries(htmlResponse.headers),effective_rpc:null,effective_contract_address:null,chain_id:null,expected_contract_version:'2.0.0',live_version_result:null,normal_ui_stale_v1:null,source_sha_expected_by_deployment:null,deployed_source_sha_proven:false,contract_source_sha256:sha(readFileSync('contracts/nimbuspact.py')),note:'Initial raw capture; effective configuration and rendered UI require separate verification. SDK transaction output is decoded; exact network responses are in ../rpc.'});
const abi=testnetBradbury.consensusDataContract;
await capture(`transactions/funding/${funding}/all-data.json`,async()=>{
 const {createPublicClient,http}=await import('viem');
 return createPublicClient({transport:http('https://rpc-bradbury.genlayer.com')}).readContract({address:abi.address,abi:abi.abi,functionName:'getTransactionAllData',args:[funding]});
});
