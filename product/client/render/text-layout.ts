export function fontCSS(size:number,weight:number,family:string){return `${weight} ${size}px ${family}`;}
export function wrapText(text:string,width:number,measure:(value:string,start:number)=>number) {
    const result:string[]=[];let paragraphStart=0;
    for(const paragraph of text.split(/\r?\n/)){
        let line='',start=paragraphStart;
        for(const token of attachClosingPunctuation(Array.from(new Intl.Segmenter('zh',{granularity:'word'}).segment(paragraph),part=>part.segment))){
            if(measure(line+token,start)<=width){line+=token;continue;}
            if(line){result.push(line);start+=line.length;line='';}
            if(measure(token,start)<=width)line=token;
            else for(const group of attachClosingPunctuation(Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(token),part=>part.segment))){
                const parts=measure(group,start)<=width?[group]:Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(group),part=>part.segment);
                for(const character of parts){if(measure(line+character,start)>width&&line){result.push(line);start+=line.length;line='';}line+=character;}
            }
        }
        result.push(line);paragraphStart+=paragraph.length+(text.slice(paragraphStart+paragraph.length,paragraphStart+paragraph.length+2)==='\r\n'?2:1);
    }
    return result;
}
function attachClosingPunctuation(parts:string[]){
    const groups:string[]=[];
    for(const part of parts){
        if(groups.length&&/^[，。！？；：、）】》」』”’%％]+$/.test(part))groups[groups.length-1]+=part;
        else groups.push(part);
    }
    return groups;
}
