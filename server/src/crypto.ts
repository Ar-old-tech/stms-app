import {createCipheriv,createDecipheriv,randomBytes,randomInt,createHmac,timingSafeEqual} from 'node:crypto';
export function identifier(prefix:string){return `${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`}
export function driverIdentifier(){return `DRV-${randomInt(1000,10000)}`}
export function encrypt(data:Buffer,key:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted])}
export function decrypt(data:Buffer,key:string){const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()])}
export function signature(body:Buffer,secret:string){return createHmac('sha256',secret).update(body).digest('hex')}
export function validSignature(body:Buffer,value:string|undefined,secret:string){if(!value||!/^[a-f\d]{64}$/i.test(value))return false;return timingSafeEqual(Buffer.from(signature(body,secret),'hex'),Buffer.from(value,'hex'))}
