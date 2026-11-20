
  const surnames=["欧阳","司马","上官","诸葛","司徒","夏侯","皇甫","尉迟","长孙","司空","公孙","慕容","令狐","宇文","东方","端木","百里","南宫","独孤","闻人","仲孙","宗政","太史","申屠","公羊","赫连","澹台"];
  const mottos={none:"",growth:"Stay curious.\nKeep growing.",purpose:"Work with purpose.\nBuild with care.",steady:"Move with intention.\nGrow at your own pace."};
  function normalize(raw={}){
    return {presentation:["male","female"].includes(raw.presentation)?raw.presentation:"keep",format:raw.format==="card"?"card":"photo",nameMode:["given","full","english","custom"].includes(raw.nameMode)?raw.nameMode:"given",nameText:String(raw.nameText||"").slice(0,40),mottoId:["none","growth","purpose","steady","custom"].includes(raw.mottoId)?raw.mottoId:"none",mottoText:String(raw.mottoText||"").slice(0,160),outfit:["keep","college","business"].includes(raw.outfit)?raw.outfit:"keep",hair:["neat","styled"].includes(raw.hair)?raw.hair:"keep",retouch:raw.retouch==="light"?"light":"natural",background:["bluegray","sky","gray"].includes(raw.background)?raw.background:"bluegray"};
  }
  function resolveName(options,resume,pinyin){
    const o=normalize(options);
    if(o.nameMode==="custom")return o.nameText.trim().toUpperCase();
    if(o.nameMode==="english")return String(resume.englishName||"").trim().toUpperCase();
    const name=String(resume.name||"").trim();
    if(!name)return "";
    if(!/\p{Script=Han}/u.test(name))return name.toUpperCase();
    if(!pinyin)return "";
    const compact=name.replace(/\s/g,""),surnameLength=surnames.some(s=>compact.startsWith(s))?2:1;
    const parts=pinyin(compact,{toneType:"none",type:"array",surname:"head"});
    if(!Array.isArray(parts)||!parts.length)return "";
    return (o.nameMode==="full"?[parts.slice(0,surnameLength).join(""),parts.slice(surnameLength).join("")].filter(Boolean).join(" "):parts.slice(surnameLength).join("")||parts.join("")).toUpperCase();
  }
  function resolveMotto(options){const o=normalize(options);return o.mottoId==="custom"?o.mottoText.trim():mottos[o.mottoId]||""}
  function validate(options,resume,pinyin){
    const o=normalize(options);if(o.format!=="card")return "";
    const name=resolveName(o,resume,pinyin),motto=resolveMotto(o);
    if(!name)return o.nameMode==="english"?"请先填写英文名，或切换到拼音／自定义落款。":"请填写小卡姓名落款。";
    if(name.length>40)return "姓名落款过长，请控制在 40 个字符以内。";
    if(motto.split(/\r?\n/).length>2)return "个人短句最多两行，请调整换行。";
    if(motto.length>96)return "个人短句请控制在 96 个字符以内。";
    return "";
  }
  function prompt(options){const o=normalize(options);return `任务：基于人物参考图，为同一个人制作韩式学年照风格的职业肖像。

【人物身份】
人物照片是唯一身份依据，保留本人可辨认的五官、脸型、年龄感、肤色和个人特征。
${o.retouch==="light"?"仅轻度整理肤质和局部光线，保留真实肌理，不改变面部比例。":"保留自然肤质与轻微真实肌理，不刻意美白或磨皮。"}

【参考图分工】
如果提供风格参考图，仅参考服装、背景、摄影与构图；忽略其中人物的脸、姓名和文字。

【构图与发型】
正面半身，平视镜头，肩部自然，表情平静友善，完整保留头发与肩部。
${o.hair==="styled"?(o.presentation==="female"?"女生款造型：在本人发长允许的范围内整理为自然侧分或中分、柔和微卷；保留发色发际线，不凭空延长头发。":o.presentation==="male"?"男生款造型：在本人发长允许的范围内整理为清爽蓬松中分，保留发色发际线。":"仅轻度整理原有发型，不改变发长或发色。" ):o.hair==="neat"?"在保留本人发长、发色和发际线的前提下，轻度整理碎发与蓬松度。":"保留本人原有发型、发长、发色与发际线。"}
不额外添加耳钉或其他未选择的配饰。

【造型方向】
${{keep:"保留本人原貌，不额外调整妆容。",male:"用户选择男生款：清爽学院气质，不改变本人身份、性别特征或年龄感。",female:"用户选择女生款：柔和学院气质，可轻度自然妆感，保留本人眼型唇形；不添加耳饰，不改变本人身份或年龄感。"}[o.presentation]}

【服装】
${{keep:"保留原照片中的服装，只整理光线与构图。",college:"深藏青西装外套，无滚边；白色翻领衬衫；藏青 V 领针织背心，领口细白边；深蓝领带带克制的白色斜条纹。",business:"简洁藏青商务外套与白色衬衫，自然合身，保留成熟职业感。"}[o.outfit]}

【背景】
${{bluegray:"冷调蓝灰影棚背景，轻微云絮状斑驳肌理，上方略深、下方略亮，人物背后自然柔和投影。",sky:"浅蓝影棚背景，低对比肌理，安静均匀，人物轮廓自然。",gray:"中性浅灰影棚背景，细腻轻微肌理，人物轮廓自然。"}[o.background]}

【光线与色调】
柔和均匀的正面影棚光，眼部清晰，无生硬阴影；低饱和、自然冷白平衡、轻微复古胶片颗粒。

【输出】
只输出无文字的人像底图。不添加姓名、短句、标志、水印、相框或装饰。
姓名和个人短句由工作台在图像生成后单独排版。`}
  function drawCard(canvas,photo,{name,motto,background="bluegray"}){
    canvas.width=720;canvas.height=1080;const c=canvas.getContext("2d");
    const palettes={bluegray:["#a5b9ce","#8ea5bf"],sky:["#d5e8f3","#c3dbe9"],gray:["#e1e3e6","#cbd0d7"]},colors=palettes[background]||palettes.bluegray;
    const gradient=c.createLinearGradient(0,0,720,1080);gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);c.fillStyle=gradient;c.fillRect(0,0,720,1080);
    c.save();c.globalAlpha=.045;for(let i=0;i<520;i++){c.fillStyle=i%2?"#fff":"#263b55";c.fillRect((i*71)%720,(i*109)%1080,2+(i%5),1+(i%3))}c.restore();
    const x=30,y=32,w=660,h=790;c.fillStyle="#c6d2df";c.fillRect(x,y,w,h);
    const scale=Math.max(w/photo.width,h/photo.height),sw=w/scale,sh=h/scale;
    c.drawImage(photo,(photo.width-sw)/2,(photo.height-sh)/2,sw,sh,x,y,w,h);
    c.strokeStyle="rgba(39,61,86,.22)";c.lineWidth=1.5;c.strokeRect(x,y,w,h);
    c.fillStyle="#202731";c.textAlign="left";c.textBaseline="alphabetic";
    let size=70,gap=2.7,letters=Array.from(name||"");
    const measure=()=>letters.reduce((sum,ch)=>sum+c.measureText(ch).width,0)+Math.max(0,letters.length-1)*gap;
    do{c.font=`${size}px "Bodoni 72",Didot,"Times New Roman",serif`;if(measure()<=635||size<=12)break;size--}while(size>12);
    let cursor=(720-measure())/2;for(const ch of letters){c.fillText(ch,cursor,906);cursor+=c.measureText(ch).width+gap}
    const lines=String(motto||"").split(/\r?\n/).filter(Boolean).slice(0,2);
    c.textAlign="center";
    lines.forEach((line,i)=>{let fontSize=27;do{c.font=`italic ${fontSize}px Georgia,"Songti SC",serif`;if(c.measureText(line).width<=618||fontSize<=17)break;fontSize--}while(fontSize>17);c.fillText(line,360,966+i*39,618)});
    return canvas;
  }
  const model={normalize,resolveName,resolveMotto,validate,prompt,drawCard,mottos};

export default model;
