import {requireAdmin,sameOrigin,errorResponse} from '@/lib/access';
import {authClient} from '@/lib/supabase';
export async function POST(request:Request){try{
 sameOrigin(request);const admin=await requireAdmin();if(Number(request.headers.get('content-length'))>4*1024*1024)throw Error('Upload an image up to 3 MB.');
 const form=await request.formData(),photo=form.get('photo'),label=String(form.get('label')??'').trim();
 if(!(photo instanceof File)||!photo.size||photo.size>3*1024*1024||!['image/jpeg','image/png','image/webp'].includes(photo.type))throw Error('Choose a JPEG, PNG or WebP up to 3 MB.');if(!label||label.length>120)throw Error('Add an image name, up to 120 characters.');
 const bytes=new Uint8Array(await photo.arrayBuffer());const valid=photo.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:photo.type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';if(!valid)throw Error('The file does not match its image type.');
 const db=await authClient(),path=admin.id+'/'+crypto.randomUUID()+'.'+(photo.type==='image/jpeg'?'jpg':photo.type==='image/png'?'png':'webp'),bucket='week7-admin-images';
 const uploaded=await db.storage.from(bucket).upload(path,photo,{contentType:photo.type});if(uploaded.error)throw Error('Image upload failed.');
 const saved=await db.rpc('week7_register_image',{p_bucket:bucket,p_path:path,p_label:label});if(saved.error){await db.storage.from(bucket).remove([path]);throw Error('Image could not be saved.');}
 return Response.json({id:saved.data.id},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return errorResponse(e);}}
