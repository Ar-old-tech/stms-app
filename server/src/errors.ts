export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export function requireValue<T>(value:T|null|undefined,message='Not found'):T{if(value==null)throw new HttpError(404,message);return value}
