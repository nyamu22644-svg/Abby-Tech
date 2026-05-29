import { OperationalLayout } from "@/components/layout/operational-layout"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <OperationalLayout>{children}</OperationalLayout>
}
