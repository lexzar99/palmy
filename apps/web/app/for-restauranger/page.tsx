import type {Metadata} from "next";
import Studio from "../tipsa/studio/Studio";
import "../tipsa/studio/studio.css";
export const metadata:Metadata={title:"Beställningssystem & hemsida för restauranger | viaeats",description:"En modern beställningssida för din restaurang. Visa menyn, ta emot beställningar och erbjud Swish och kort. Se viaeats i praktiken och jämför ett erbjudande.",alternates:{canonical:"/for-restauranger"},openGraph:{title:"Er mat. Er hemsida. En enklare beställning.",description:"Se viaeats beställningssystem för restauranger i praktiken.",url:"https://viaeats.se/for-restauranger",images:[{url:"/partners/studio/product.jpg",width:1080,height:1920}]}};
export default function Page(){return <Studio/>}
