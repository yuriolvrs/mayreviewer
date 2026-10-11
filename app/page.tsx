import HomeMount from "@/app/components/HomeMount";
import Landing from "@/app/components/Landing";

// "/" is two pages in one static file: the landing for first-time visitors
// and the reviewers home for everyone else. EntryScript picks before first
// paint, so the route stays static, offline-cacheable, and flash-free.
export default function Page() {
  return (
    <>
      <Landing />
      <HomeMount />
    </>
  );
}
