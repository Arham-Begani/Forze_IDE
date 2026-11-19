import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function conflict() { return Object.assign(new Error('Room changed in another window. Refresh and try again.'),{status:409}); }
export function fileStore(directory) {
  const dir=resolve(directory || './data');
  mkdirSync(dir,{recursive:true,mode:0o700});
  const path=id=>join(dir,id+'.json');
  return {
    async load(id) { return existsSync(path(id)) ? JSON.parse(readFileSync(path(id),'utf8')) : null; },
    async save(room) {
      const target=path(room.id);
      const version=existsSync(target) ? JSON.parse(readFileSync(target,'utf8')).version : 0;
      if(version !== (room.version || 0)) throw conflict();
      room.version=version+1;
      writeFileSync(target+'.tmp',JSON.stringify(room),{mode:0o600});
      renameSync(target+'.tmp',target);
    }
  };
}

export function blobStore() {
  const tags=new WeakMap();
  const key=id=>'debug-rooms/'+id+'.json';
  return {
    async load(id) {
      const {get}=await import('@vercel/blob');
      const response=await get(key(id),{access:'private',useCache:false});
      if (!response) return null;
      const room=await new Response(response.stream).json();
      tags.set(room,response.blob.etag);
      return room;
    },
    async save(room) {
      const {put,BlobPreconditionFailedError}=await import('@vercel/blob');
      const tag=tags.get(room);
      try {
        const result=await put(key(room.id),JSON.stringify(room),{access:'private',addRandomSuffix:false,
          contentType:'application/json',allowOverwrite:!!tag,...(tag ? {ifMatch:tag} : {})});
        tags.set(room,result.etag);
      } catch(e) { if(e instanceof BlobPreconditionFailedError) throw conflict(); throw e; }
    }
  };
}
