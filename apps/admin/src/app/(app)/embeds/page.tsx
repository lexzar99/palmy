import { redirect } from "next/navigation";

// "Meny på egen hemsida" är ersatt av sektionen Domäner i restaurangformuläret,
// där embedkoden och de godkända domänerna ligger tillsammans.
export default function Page() {
  redirect("/restaurants");
}
