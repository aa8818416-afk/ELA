import { redirect } from "next/navigation";

export default function RegisterPage() {
  // Page disabled as per user request for security
  redirect("/login");
}
