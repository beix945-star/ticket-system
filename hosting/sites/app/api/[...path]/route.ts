import {env} from 'cloudflare:workers';
import {handle} from '../../hosted-api';
export const dynamic='force-dynamic';
const route=(request:Request)=>handle(request,env.DB!);
export {route as GET,route as POST,route as PATCH};
