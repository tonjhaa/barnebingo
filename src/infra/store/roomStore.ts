import { isExpired, type Room } from '@/domain/room'

/**
 * Lagringsgrensesnittet. Hele appen kjenner bare dette — å bytte til Redis er
 * én ny implementasjon, ikke en refaktorering.
 */
export interface RoomStore {
  save(room: Room): void
  get(roomId: string): Room | undefined
  getByCode(code: string): Room | undefined
  remove(roomId: string): void
  all(): Room[]
  codeTaken(code: string): boolean
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>()
  private byCode = new Map<string, string>()

  save(room: Room): void {
    this.rooms.set(room.id, room)
    this.byCode.set(room.code, room.id)
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId)
  }

  getByCode(code: string): Room | undefined {
    const id = this.byCode.get(code)
    return id ? this.rooms.get(id) : undefined
  }

  remove(roomId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return
    this.rooms.delete(roomId)
    this.byCode.delete(room.code)
  }

  all(): Room[] {
    return [...this.rooms.values()]
  }

  codeTaken(code: string): boolean {
    return this.byCode.has(code)
  }
}

/** Rom som har gått ut på tid. Kalleren rydder også opp i tilhørende selfier. */
export function expiredRooms(store: RoomStore, now: number): Room[] {
  return store.all().filter((room) => room.status === 'closed' || isExpired(room, now))
}
