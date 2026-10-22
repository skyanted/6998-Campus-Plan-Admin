import assert from 'node:assert/strict';
const base='http://localhost:3004';let checks=0;
async function request(path,expected,options={}){const response=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(10000),...options});assert.equal(response.status,expected,path+' unexpected status');checks++;console.log('PASS '+(options.method??'GET')+' '+path+' → '+response.status);return response;}
for(const path of ['/','/events','/events/new','/events/1','/events/generations/1','/users','/users/00000000-0000-4000-8000-000000000001','/votes']){const response=await request(path,307);assert.equal(new URL(response.headers.get('location'),base).pathname,'/login');}
for(const path of ['/api/admin/image?bucket=week4-event-images&path=test','/api/admin/image?bucket=week4-avatars&path=test','/api/admin/covers/study']){const response=await request(path,401);assert.equal(response.headers.get('cache-control'),'private, no-store');}
for(const path of ['/api/admin/command','/api/admin/generate']){
 await request(path,401,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
 await request(path,403,{method:'POST',headers:{Origin:'https://external.invalid','Content-Type':'application/json'},body:'{}'});
 await request(path,403,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
}
for(const path of ['/api/admin/command','/api/admin/generate'])await request(path,405);
const callback=await request('/auth/callback',307);assert.equal(new URL(callback.headers.get('location'),base).pathname,'/login');
await request('/auth/return',403,{method:'POST',headers:{Origin:'https://external.invalid','Content-Type':'application/json'},body:JSON.stringify({next:'/events'})});
const safe=await request('/auth/return',200,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({next:'https://external.invalid'})});const cookie=safe.headers.get('set-cookie');assert.match(cookie,/campus-admin-return-to=%2F;/);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=lax/i);
await request('/auth/signout',403,{method:'POST',headers:{Origin:'https://external.invalid'}});
await request('/login',200);
console.log(checks+' HTTP access checks passed. No authenticated business mutations were sent.');
