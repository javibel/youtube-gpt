import { ImageResponse } from 'next/og';

// An infographic fallback,rendered directly from the captured
// draft. This renderer grants no publication/upload or recovery authority.
export function renderManualSocialInfographic(content:string):ImageResponse {
  const quote=content.replace(/[#*_`]/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,300);
  if(!quote)throw Error('social_publish_unconfirmed');
  return new ImageResponse(
    <div style={{width:'1080px',height:'1080px',display:'flex',flexDirection:'column',justifyContent:'center',background:'#0B0B0D',padding:'100px',color:'#ffffff',fontFamily:'sans-serif'}}>
      <div style={{display:'flex',color:'#ee4d5e',fontSize:24,marginBottom:48}}>YouTube · YTubViral</div>
      <div style={{display:'flex',fontSize:quote.length>180?48:64,lineHeight:1.25}}>{quote}</div>
      <div style={{display:'flex',color:'#a1a1aa',fontSize:24,marginTop:64}}>ytubviral.com</div>
    </div>,
    {width:1080,height:1080},
  );
}
