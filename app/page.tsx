import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { Landing } from "@/components/landing";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

export default async function LandingPage() {
  const { userId } = await auth();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <Landing initialTheme={theme} signedIn={Boolean(userId)} />;
}
