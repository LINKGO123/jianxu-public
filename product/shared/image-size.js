export function imageSize(bytes,mime) {
    if(!bytes.length||bytes.length>15*1024*1024)throw new Error('照片为空或超过 15 MiB。');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0;
    if(mime==='image/png'&&bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)&&new TextDecoder().decode(bytes.subarray(12,16))==='IHDR'){width=view.getUint32(16);height=view.getUint32(20);}
    else if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){
        let at=2;while(at+4<bytes.length){if(bytes[at]!==255)break;const marker=bytes[at+1];if(marker===0xda||marker===0xd9)break;const size=view.getUint16(at+2);if(size<2||at+2+size>bytes.length)throw new Error('JPEG 文件损坏。');
            if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&size>=7){height=view.getUint16(at+5);width=view.getUint16(at+7);break;}at+=2+size;
        }
    }else if(mime==='image/webp'&&bytes.length>=30&&new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'&&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP'){
        const kind=new TextDecoder().decode(bytes.subarray(12,16));
        const le24=(at)=>bytes[at]|bytes[at+1]<<8|bytes[at+2]<<16;
        if(kind==='VP8X'){width=1+le24(24);height=1+le24(27);}
        if(kind==='VP8 '&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a){width=view.getUint16(26,true)&0x3fff;height=view.getUint16(28,true)&0x3fff;}
        if(kind==='VP8L'&&bytes[20]===0x2f){const packed=view.getUint32(21,true);width=(packed&0x3fff)+1;height=((packed>>>14)&0x3fff)+1;}
    }
    if(!width||!height||width*height>24000000)throw new Error('照片签名/尺寸无效，或超过 2400 万像素；仅支持 JPEG、PNG、WebP。');
    return {width,height};
}
