import { z } from 'zod';
export const assetSchema=z.object({id:z.string().uuid(),parentId:z.string().uuid().nullable(),kind:z.enum(['original','crop','ai','card','template']),sourceId:z.string().uuid().optional(),templateId:z.string().uuid().optional(),faceRestored:z.boolean().optional(),blob:z.instanceof(Blob),width:z.number().int().positive().max(24000000),height:z.number().int().positive().max(24000000)}).strict().superRefine((asset,ctx)=>{
    if(asset.width*asset.height>24000000||asset.blob.size>15*1024*1024||!['image/png','image/jpeg','image/webp'].includes(asset.blob.type))ctx.addIssue({code:'custom',message:'照片大小、像素或格式不支持'});
});
export type PortraitAsset=z.infer<typeof assetSchema>;
export type Assets=Record<string,PortraitAsset>;
export const assetsSchema=z.record(z.string().uuid(),assetSchema).refine(assets=>Object.entries(assets).every(([id,asset])=>id===asset.id),'资产标识不匹配');
