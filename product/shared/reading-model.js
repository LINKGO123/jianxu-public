/* Pure content policy shared by the interactive editor and verification scripts. */

  const sections=[
    {id:"summary",name:"职业概述",fields:["summary"]},
    {id:"work",name:"工作经历",fields:["company","dates","achievement"]},
    {id:"project",name:"项目经历",fields:["project"]},
    {id:"education",name:"教育背景",fields:["education"]},
    {id:"internship",name:"实习经历",fields:["internship"]},
    {id:"campus",name:"在校经历",fields:["campus"]},
    {id:"skills",name:"专业技能",fields:["skills"]},
    {id:"certificates",name:"证书与荣誉",fields:["certificates"]}
  ];
  const original=["summary","work","project","education","skills","internship","campus","certificates"];
  const presets={
    graduate:["education","internship","project","campus","skills","certificates","summary","work"],
    experienced:["summary","work","project","education","skills","certificates","internship","campus"]
  };
  const ids=sections.map(s=>s.id);
  function normalize(value){
    const raw=value&&typeof value==="object"?value:{};
    const profile=["graduate","experienced","custom"].includes(raw.profile)?raw.profile:null;
    const baseProfile=["graduate","experienced"].includes(raw.baseProfile)?raw.baseProfile:(profile==="graduate"||profile==="experienced"?profile:null);
    const proposed=Array.isArray(raw.order)?raw.order:(presets[profile]||original);
    const order=[...new Set(proposed.filter(id=>ids.includes(id))),...ids.filter(id=>!proposed.includes(id))];
    const hidden=[...new Set((Array.isArray(raw.hidden)?raw.hidden:[]).filter(id=>ids.includes(id)))];
    const emphasis=["auto","education","work","project"].includes(raw.emphasis)?raw.emphasis:"auto";
    return {profile,baseProfile,order,hidden,emphasis};
  }
  function available(id,resume){return sections.find(s=>s.id===id)?.fields.some(f=>String(resume?.[f]||"").trim().length>0)||false}
  function visible(value,resume){const strategy=normalize(value);return strategy.order.filter(id=>!strategy.hidden.includes(id)&&available(id,resume))}
  function primary(value,resume){
    const s=normalize(value),shown=visible(s,resume);
    const preferred=s.emphasis!=="auto"?s.emphasis:s.baseProfile==="graduate"?"education":s.baseProfile==="experienced"?"work":null;
    return shown.includes(preferred)?preferred:(s.profile?shown[0]||null:null);
  }
  function preset(profile,current){
    const previous=normalize(current);
    if(profile==="custom")return {...previous,profile:"custom"};
    if(!presets[profile])return normalize(null);
    return normalize({profile,baseProfile:profile,order:presets[profile],hidden:[],emphasis:"auto"});
  }
  function name(value){const s=normalize(value);return {graduate:"应届求职",experienced:"社会招聘",custom:"自己安排"}[s.profile]||"保留原稿顺序"}
  const model={sections,normalize,available,visible,primary,preset,name};

export default model;
