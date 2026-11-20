import {BlockList,isIP} from 'node:net';
import {lookup} from 'node:dns/promises';
import {qwenResultHosts} from '../shared/image-hosts.js';
const denied=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)denied.addSubnet(address,prefix,'ipv4');
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
for(const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20],['3ffe::',16]] as const)denied.addSubnet(address,prefix,'ipv6');
export function publicAddress(address:string){const family=isIP(address);return family===4?!denied.check(address,'ipv4'):family===6&&global6.check(address,'ipv6')&&!denied.check(address,'ipv6');}
export function externalUrl(base:string){const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(url.port&&url.port!=='443'))throw new Error('仅支持无凭据、查询参数和片段的 HTTPS 公网地址，端口443。');if(url.hostname.endsWith('.')||url.hostname==='localhost'||url.hostname.endsWith('.localhost'))throw new Error('不允许本机地址。');return url;}
// Result URLs use expiring signatures; connection Base URLs still cannot contain queries.
export function imageResultUrl(address:string){const url=new URL(address),query=url.search;url.search='';const checked=externalUrl(url.href);checked.search=query;return checked;}
export function proxyCompatibleHost(url:URL,imageResult=false){return imageResult?qwenResultHosts.includes(url.hostname):url.hostname==='ark.cn-beijing.volces.com'||url.hostname==='api.deepseek.com'||url.hostname==='api.openai.com'||url.hostname==='maas.qianwenaiapi.com';}
export async function resolveTarget(url:URL,resolver:(host:string,options:{all:true;verbatim:true})=>Promise<{address:string;family:number}[]>=lookup,proxyCompatibility=false,imageResult=false){const allowFakeIp=proxyCompatibility&&proxyCompatibleHost(url,imageResult);const host=url.hostname.replace(/^\[|\]$/g,'');const family=isIP(host);const addresses=family?[{address:host,family}]:await resolver(host,{all:true,verbatim:true});if(!addresses.length||addresses.some(a=>!allowedTarget(a.address,allowFakeIp)))throw new Error('目标包含私网、保留或不可访问地址，未发送请求。');return addresses[0];}
function allowedTarget(address:string,allowFakeIp:boolean){return publicAddress(address)||(allowFakeIp&&isIP(address)===4&&/^198\.(18|19)\./.test(address));}
function canonical(address:string){return isIP(address)===6?new URL(`https://[${address}]/`).hostname:address;}
export function assertRemote(remote:string|undefined,pinned:string,allowFakeIp=false){if(!remote||!allowedTarget(remote,allowFakeIp)||canonical(remote)!==canonical(pinned))throw new Error('实际连接目标不匹配，未发送凭据。');}
export function connectionUrl(base:string){const url=externalUrl(base);url.pathname=url.pathname.replace(/\/+$/,'')+'/chat/completions';return url;}
