import { PlayerScreen } from '@/ui/player/PlayerScreen'

export default async function BliMedPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  return <PlayerScreen code={code.toUpperCase()} />
}
