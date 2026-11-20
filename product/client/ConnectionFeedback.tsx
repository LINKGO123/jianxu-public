import {useState,type RefObject} from 'react';
export function connectionMessage(message:string){
 const code=message.match(/^\[([^\s·\]]+)/)?.[1];
 const messages:Record<string,string>={
  AUTH_FAILED:'密钥未通过验证，请检查是否复制完整。',FORBIDDEN:'当前账户无法使用这项服务，请检查模型权限或地区限制。',
  RATE_OR_QUOTA:'服务暂时拒绝请求，请检查账户余额、使用限额，或稍后再试。',ENDPOINT_NOT_FOUND:'没有找到这项服务，请检查所选服务或高级设置中的地址和模型。',MODEL_NOT_OPEN:'模型尚未开通：请到火山方舟控制台开通该模型，或改用已开通的接入点ID（ep-）。',
  RATE_LIMITED:'请求过于频繁，请稍后再试。',QUOTA_EXHAUSTED:'服务额度或余额不足，请到服务提供方的控制台检查。',CONTENT_REJECTED:'照片或要求未通过服务方审核，请调整后再试。',
  IMAGE_DOWNLOAD_FAILED:'照片可能已经生成，但下载未完成。请检查网络，避免重复生成再次计费。',
  REQUEST_REJECTED:'服务不接受当前设置，请核对高级设置或联系服务提供方。',UPSTREAM_ERROR:'服务提供方暂时出现问题，请稍后再检查。',
  DNS_FAILED:'暂时找不到服务地址，请检查网络或服务地址。',NETWORK_FAILED:'暂时连接不上服务，请检查网络或代理设置。',
  TARGET_REJECTED:'服务地址被拦截。请查看当前助手高级设置中的网络说明；支持代理兼容的服务可按需开启。',
  REDIRECT_REJECTED:'服务地址发生了跳转，请向服务提供方确认正确地址。',RESPONSE_FORMAT:'当前服务返回的内容与此功能不兼容，请检查服务选择和高级设置。',
  CANCELLED_OR_TIMEOUT:'检查已取消或等待超时，请先确认服务状态，不要连续重复检查。',SESSION_EXPIRED:'本次连接已到期，请重新填写密钥并连接。',
  LOCAL_NETWORK_FAILED:'暂时连接不上本机服务，请确认简序服务正在运行，再刷新页面。',LOCAL_RESPONSE_FORMAT:'本机服务状态暂时无法读取，请刷新页面后重试。',
  OPERATION_FAILED:'这次操作未完成，请查看问题详情后再试。',
 };
 if(code==='TARGET_REJECTED'&&message.includes('VPN兼容未开启'))return '本次请求到达后端时，VPN兼容未启用。请用“只检查网络”核对当前开关，无需重新生图。';
 if(code==='TARGET_REJECTED'&&message.includes('VPN兼容已开启'))return '后端已启用VPN兼容，但目标地址仍被拦截。请保留问题详情中的目标域名，继续检查代理和DNS。';
 if(code==='NETWORK_VERIFIED'||code==='VERIFIED'||code==='DISCOVERED'||code==='DISCONNECTED')return message.replace(/^\[[^\]]+\]\s*/,'');
 if(code?.startsWith('LOCAL_HTTP_'))return '本机服务没有完成请求，请刷新页面后重新检查。';
 return code?(messages[code]??'这次操作未完成，请查看问题详情。'):message;
}
export function ConnectionFeedback({message,refreshError='',error=false}:{message:string;refreshError?:string;error?:boolean}){
 return <>{message&&<div className="connection-feedback"><p role={error?'alert':'status'}>{connectionMessage(message)}</p>{/^\[/.test(message)&&!/^\[(NETWORK_VERIFIED|VERIFIED|DISCOVERED|DISCONNECTED)\]/.test(message)&&<details><summary>查看问题详情</summary><pre>{message}</pre></details>}</div>}{refreshError&&<div className="connection-feedback"><p role="alert">连接状态暂未更新，上方操作结果仍然保留。请刷新页面，不要重复发起可能收费的检查。</p><details><summary>查看状态读取详情</summary><pre>{refreshError}</pre></details></div>}</>;
}
export function ConnectionKey({inputRef,label='连接密钥',onChange}:{inputRef:RefObject<HTMLInputElement|null>;label?:string;onChange:()=>void}){
 const [visible,setVisible]=useState(false);
 return <label>{label}<span className="connection-key"><input ref={inputRef} type={visible?'text':'password'} autoComplete="new-password" maxLength={512} placeholder="粘贴服务提供方给你的密钥" onChange={onChange}/><button type="button" aria-pressed={visible} aria-label={visible?'隐藏连接密钥':'显示连接密钥'} onClick={()=>setVisible(!visible)}>{visible?'隐藏':'显示'}</button></span></label>;
}
