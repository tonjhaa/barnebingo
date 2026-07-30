import { HostScreen } from '@/ui/host/HostScreen'

export default async function VertPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  return <HostScreen roomId={roomId} />
}
