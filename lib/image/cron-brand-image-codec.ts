import sharp from 'sharp';
// Fully decode only in-memory bytes;no URL,path,AI,upload or publication.
export async function decodeCronBrandImage(bytes:Buffer):Promise<Buffer>{
 if(bytes.length<4||bytes.length>15*1024*1024)throw Error('daily_brand_image_unconfirmed');
 const png=bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=bytes.readUInt16BE(0)===0xffd8&&bytes.readUInt16BE(bytes.length-2)===0xffd9,webp=bytes.length>=12&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!png&&!jpeg&&!webp)throw Error('daily_brand_image_unconfirmed');
 const image=sharp(bytes,{limitInputPixels:1024*1024,sequentialRead:true,animated:false}),metadata=await image.metadata();
 if(!['png','jpeg','webp'].includes(metadata.format??'')||metadata.width!==1024||metadata.height!==1024||(metadata.pages??1)!==1)throw Error('daily_brand_image_unconfirmed');
 const {data,info}=await image.flatten({background:'#0B0B0D'}).jpeg({quality:88,chromaSubsampling:'4:2:0',progressive:false}).toBuffer({resolveWithObject:true});
 if(info.format!=='jpeg'||info.width!==1024||info.height!==1024||info.channels!==3||data.length<4||data.length>5*1024*1024||data.readUInt16BE(0)!==0xffd8||data.readUInt16BE(data.length-2)!==0xffd9)throw Error('daily_brand_image_unconfirmed');return data;
}
