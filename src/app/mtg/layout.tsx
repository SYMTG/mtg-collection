import TopNav from "@/components/TopNav";

export default function MtgLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      {children}
    </>
  );
}
