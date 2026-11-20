import {cropGeometry} from '../portrait/image.js';
import type {ResumeDocument} from '../../shared/schemas.js';
import type {Assets} from '../portrait/assets.js';
export function portraitSources(doc:ResumeDocument,assets:Assets){
    const applied=doc.portrait.appliedAssetId?assets[doc.portrait.appliedAssetId]:null;
    const current=applied?.kind==='card'&&applied.sourceId?assets[applied.sourceId]:applied;
    let original=current;
    while(original&&(original.kind==='ai'||original.kind==='card'))original=original.sourceId?assets[original.sourceId]:null;
    // Only a confirmed crop is sent; its original asset may be an entire PDF page.
    const crop=original?.kind==='crop'?original:null,root=doc.portrait.originalAssetId?assets[doc.portrait.originalAssetId]:null;
    const scale=crop&&root&&doc.portrait.crop?cropGeometry(root.width,root.height,crop.width,crop.height,doc.portrait.crop).scale:null;
    return {current,original:crop,originalResolution:crop&&scale?{width:Math.round(crop.width/scale),height:Math.round(crop.height/scale)}:null};
}
