import sharp from 'sharp';

// CPU conversion of the original local PNG. No paths,URLs,fetches,AI or
// publication authority enter this encoder. Caller retains its own deadline.
export async function encodeManualSocialJpeg(png:Buffer):Promise<Buffer>{
  if(png.length<33||png.length>5*1024*1024||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.readUInt32BE(16)!==1080||png.readUInt32BE(20)!==1080)throw Error('social_publish_unconfirmed');
  const {data,info}=await sharp(png,{limitInputPixels:1080*1080,sequentialRead:true}).flatten({background:'#0B0B0D'}).jpeg({quality:88,chromaSubsampling:'4:2:0',progressive:false}).toBuffer({resolveWithObject:true});
  if(info.format!=='jpeg'||info.width!==1080||info.height!==1080||info.channels!==3||data.length<4||data.length>5*1024*1024||data.readUInt16BE(0)!==0xffd8||data.readUInt16BE(data.length-2)!==0xffd9)throw Error('social_publish_unconfirmed');
  return data;
}
